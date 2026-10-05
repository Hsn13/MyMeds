document.addEventListener("submit", (event) => {
  const message = event.target.dataset.confirm;
  if (message && !window.confirm(message)) {
    event.preventDefault();
  }
});

const navigationLoader = document.querySelector("[data-navigation-loader]");

function showNavigationLoader() {
  if (!navigationLoader) return;
  navigationLoader.hidden = false;
  navigationLoader.setAttribute("aria-hidden", "false");
}

document.addEventListener("click", (event) => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const link = event.target.closest("a[href]");
  if (
    !link ||
    link.target ||
    link.hasAttribute("download") ||
    link.dataset.noLoader !== undefined
  ) {
    return;
  }

  const destination = new URL(link.href, window.location.href);
  if (
    destination.origin !== window.location.origin ||
    destination.pathname === window.location.pathname &&
      destination.search === window.location.search &&
      destination.hash
  ) {
    return;
  }

  event.preventDefault();
  showNavigationLoader();
  window.setTimeout(() => {
    window.location.assign(destination.href);
  }, 90);
});

document.addEventListener("submit", (event) => {
  if (event.defaultPrevented || event.target.target) return;
  showNavigationLoader();
});

window.addEventListener("pageshow", () => {
  if (navigationLoader) {
    navigationLoader.hidden = true;
    navigationLoader.setAttribute("aria-hidden", "true");
  }
});

const roleSelect = document.getElementById("role");
const clinicianGroup = document.getElementById("clinician-group");

if (roleSelect && clinicianGroup) {
  const updateClinicianVisibility = () => {
    clinicianGroup.hidden = roleSelect.value !== "patient";
  };
  roleSelect.addEventListener("change", updateClinicianVisibility);
  updateClinicianVisibility();
}

const medicationStartDate = document.getElementById("startDate");
const medicationEndDate = document.getElementById("endDate");
if (medicationStartDate && medicationEndDate) {
  const syncMedicationDateRange = () => {
    medicationEndDate.min = medicationStartDate.value;
  };
  medicationStartDate.addEventListener("change", syncMedicationDateRange);
  syncMedicationDateRange();
}

document.getElementById("medFilter")?.addEventListener("change", (event) => {
  event.target.form.requestSubmit();
});

const analyticsRange = document.querySelector('select[name="range"]');
document
  .querySelectorAll('.analytics-filters input[type="date"]')
  .forEach((input) => {
    input.addEventListener("change", () => {
      if (analyticsRange) analyticsRange.value = "custom";
    });
  });

const themeToggle = document.querySelector("[data-theme-toggle]");
const themePreferenceKey = "mymeds-theme";
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(preference) {
  const dark =
    preference === "dark" || (preference === "system" && systemTheme.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  if (themeToggle) {
    themeToggle.setAttribute("aria-pressed", String(dark));
    themeToggle.setAttribute(
      "aria-label",
      dark ? "Switch to light theme" : "Switch to dark theme",
    );
    const label = themeToggle.querySelector("[data-theme-label]");
    if (label) label.textContent = dark ? "Light mode" : "Dark mode";
  }
}

let savedTheme = "system";
try {
  const storedTheme = window.localStorage.getItem(themePreferenceKey);
  if (storedTheme === "light" || storedTheme === "dark") savedTheme = storedTheme;
} catch {
  savedTheme = "system";
}
applyTheme(savedTheme);

systemTheme.addEventListener("change", () => {
  if (savedTheme === "system") applyTheme("system");
});

themeToggle?.addEventListener("click", () => {
  savedTheme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try {
    window.localStorage.setItem(themePreferenceKey, savedTheme);
  } catch {
    // Keep the selection active for the current page when storage is unavailable.
  }
  applyTheme(savedTheme);
});
