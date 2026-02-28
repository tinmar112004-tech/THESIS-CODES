// SIDEBAR TOGGLE
const menuBtn = document.getElementById("menuBtn");
const sidebar = document.getElementById("sidebar");

menuBtn.addEventListener("click", () => {
    sidebar.classList.toggle("show");
});

// RESOLUTION SECTION TOGGLE
const toggleResolution = document.getElementById("toggleResolution");
const resolutionSection = document.getElementById("resolutionSection");

toggleResolution.addEventListener("click", () => {
    resolutionSection.style.display =
        resolutionSection.style.display === "none" ? "block" : "none";
});

// FORM SUBMISSION + CONTROL NUMBER CONFIRMATION
const form = document.querySelector("form");
const controlNumberInput = document.querySelector("input[readonly]");
const modal = document.getElementById("confirmationModal");
const confirmControlNumber = document.getElementById("confirmControlNumber");
const closeModal = document.getElementById("closeModal");

form.addEventListener("submit", (e) => {
    e.preventDefault();

    // Auto-generate control number if empty
    if (!controlNumberInput.value) {
        const now = new Date();
        const controlNumber =
            "CMP-" +
            now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, "0") +
            String(now.getDate()).padStart(2, "0") +
            "-" +
            Math.floor(Math.random() * 10000);

        controlNumberInput.value = controlNumber;
    }

    // Show confirmation modal
    confirmControlNumber.textContent = controlNumberInput.value;
    modal.style.display = "flex";
});

// CLOSE MODAL
closeModal.addEventListener("click", () => {
    modal.style.display = "none";
});
