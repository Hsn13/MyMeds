const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const Message = require("../models/Message.js");
const User = require("../models/User.js");
const logError = require("../utils/log-error.js");

const userIdOf = (user) => user._id.toString();
const canSendType = (role, type) =>
  role === "patient"
    ? type === "message"
    : ["message", "feedback", "review_flag"].includes(type);
const messagePostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many messages. Please wait before sending another.",
});

router.get("/", async (req, res) => {
  try {
    const user = req.session.user;
    if (user.role === "patient") {
      const clinician = user.assignedClinicianId
        ? await User.findOne({
            _id: user.assignedClinicianId,
            role: "clinician",
            isActive: true,
          }).select("name")
        : null;
      const [messages, unreadCount] = clinician
        ? await Promise.all([
            Message.find({
              patientId: user._id,
              clinicianId: clinician._id,
            })
              .sort({ createdAt: -1 })
              .limit(100),
            Message.countDocuments({
              patientId: user._id,
              clinicianId: clinician._id,
              recipientId: user._id,
              readAt: null,
            }),
          ])
        : [[], 0];
      return res.render("messages/inbox.ejs", {
        role: user.role,
        threads: clinician
          ? [{ patient: null, clinician, latest: messages[0], unreadCount, href: "/messages/thread" }]
          : [],
        clinician,
        unreadCount,
      });
    }

    const patients = await User.find({
      role: "patient",
      assignedClinicianId: user._id,
      isActive: true,
    }).select("name username");
    const patientIds = patients.map((patient) => patient._id);
    const messages = patientIds.length
      ? await Message.find({
          clinicianId: user._id,
          patientId: { $in: patientIds },
        })
          .sort({ createdAt: -1 })
          .limit(1000)
      : [];
    const threads = patients.map((patient) => {
      const threadMessages = messages.filter(
        (message) => message.patientId.toString() === patient._id.toString(),
      );
      return {
        patient,
        latest: threadMessages[0],
        href: `/messages/thread/${encodeURIComponent(patient._id.toString())}`,
        unreadCount: threadMessages.filter(
          (message) =>
            message.recipientId.toString() === userIdOf(user) &&
            !message.readAt,
        ).length,
      };
    });
    threads.sort(
      (a, b) =>
        (b.latest?.createdAt?.getTime() || 0) -
        (a.latest?.createdAt?.getTime() || 0),
    );
    const unreadCount = threads.reduce(
      (total, thread) => total + thread.unreadCount,
      0,
    );
    res.render("messages/inbox.ejs", {
      role: user.role,
      threads,
      clinician: null,
      unreadCount,
    });
  } catch (err) {
    logError("Message inbox loading failed", err, res.locals.requestId);
    res.status(500).send("Unable to load your messages.");
  }
});

async function getThread(req, res, next) {
  try {
    const user = req.session.user;
    let patient;
    let clinician;
    if (user.role === "patient") {
      patient = user;
      clinician = user.assignedClinicianId
        ? await User.findOne({
            _id: user.assignedClinicianId,
            role: "clinician",
            isActive: true,
          }).select("name")
        : null;
    } else {
      if (!mongoose.isValidObjectId(req.params.patientId)) {
        return res.status(404).send("Message thread not found.");
      }
      patient = await User.findOne({
        _id: req.params.patientId,
        role: "patient",
        assignedClinicianId: user._id,
        isActive: true,
      }).select("name username");
      clinician = user;
    }
    if (!patient || !clinician) {
      return res.status(404).render("messages/thread.ejs", {
        patient: patient || null,
        clinician: clinician || null,
        messages: [],
        currentUserId: userIdOf(user),
        error: "Messaging is available only between a patient and their assigned clinician.",
        canCompose: false,
      });
    }

    const pair = { patientId: patient._id, clinicianId: clinician._id };
    await Message.updateMany(
      {
        ...pair,
        recipientId: user._id,
        readAt: null,
      },
      { $set: { readAt: new Date() } },
    );
    const messages = await Message.find(pair).sort({ createdAt: 1 }).limit(250);
    req.messageThread = {
      patient,
      clinician,
      messages,
      currentUserId: userIdOf(user),
      canCompose: true,
      error: null,
      validationError: req.query.error === "invalid",
    };
    next();
  } catch (err) {
    next(err);
  }
}

router.get("/thread", (req, res, next) => {
  if (req.session.user.role !== "patient") {
    return res.status(404).send("Message thread not found.");
  }
  getThread(req, res, (err) => {
    if (err) return next(err);
    res.render("messages/thread.ejs", req.messageThread);
  });
});

router.get("/thread/:patientId", (req, res, next) => {
  if (req.session.user.role !== "clinician") {
    return res.status(404).send("Message thread not found.");
  }
  getThread(req, res, (err) => {
    if (err) return next(err);
    res.render("messages/thread.ejs", req.messageThread);
  });
});

router.post("/thread", messagePostLimiter, async (req, res, next) => {
  if (req.session.user.role !== "patient") {
    return res.status(404).send("Message thread not found.");
  }
  await sendMessage(req, res, next);
});

router.post("/thread/:patientId", messagePostLimiter, async (req, res, next) => {
  if (req.session.user.role !== "clinician") {
    return res.status(404).send("Message thread not found.");
  }
  await sendMessage(req, res, next);
});

async function sendMessage(req, res, next) {
  try {
    const user = req.session.user;
    const body = typeof req.body.body === "string" ? req.body.body.trim() : "";
    const type = typeof req.body.type === "string" ? req.body.type : "message";
    if (!body || body.length > 3000 || !canSendType(user.role, type)) {
      const target =
        user.role === "patient"
          ? "/messages/thread"
          : `/messages/thread/${encodeURIComponent(req.params.patientId)}`;
      return res.redirect(`${target}?error=invalid`);
    }

    const patient =
      user.role === "patient"
        ? user
        : mongoose.isValidObjectId(req.params.patientId)
          ? await User.findOne({
              _id: req.params.patientId,
              role: "patient",
              assignedClinicianId: user._id,
              isActive: true,
            }).select("_id assignedClinicianId")
          : null;
    const clinician =
      user.role === "clinician"
        ? user
        : user.assignedClinicianId
          ? await User.findOne({
              _id: user.assignedClinicianId,
              role: "clinician",
              isActive: true,
            }).select("_id")
          : null;

    if (!patient || !clinician) return res.status(404).send("Message thread not found.");
    await Message.create({
      patientId: patient._id,
      clinicianId: clinician._id,
      senderId: user._id,
      recipientId: user.role === "patient" ? clinician._id : patient._id,
      type,
      body,
    });
    res.redirect(
      user.role === "patient"
        ? "/messages/thread"
        : `/messages/thread/${encodeURIComponent(patient._id.toString())}`,
    );
  } catch (err) {
    next(err);
  }
}

router.use((err, req, res, next) => {
  logError("Message request failed", err, res.locals.requestId);
  if (res.headersSent) return next(err);
  res.status(500).send("Unable to complete that message request.");
});

module.exports = router;
