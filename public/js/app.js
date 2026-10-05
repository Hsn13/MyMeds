document.addEventListener("submit", (event) => {
  const message = event.target.dataset.confirm;
  if (message && !window.confirm(message)) {
    event.preventDefault();
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

document.getElementById("medFilter")?.addEventListener("change", (event) => {
  event.target.form.requestSubmit();
});
