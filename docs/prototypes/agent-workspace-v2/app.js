/* global document, window */

const screenButtons = document.querySelectorAll("[data-go]");
const screens = document.querySelectorAll(".screen");
const navItems = document.querySelectorAll(".nav-item");
const screenTitle = document.querySelector("#screen-title");
const tabs = document.querySelectorAll(".tab");
const tabPanels = document.querySelectorAll(".tab-panel");

function showScreen(screenId) {
  const target = document.querySelector(`#screen-${screenId}`);
  if (!target) return;

  screens.forEach((screen) => {
    screen.classList.toggle("active", screen === target);
  });

  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.go === screenId);
  });

  if (screenTitle) {
    screenTitle.textContent = target.dataset.title || "Agent Workspace";
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

screenButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextScreen = button.dataset.go;
    if (nextScreen) showScreen(nextScreen);
  });
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const tabId = tab.dataset.tab;
    if (!tabId) return;

    tabs.forEach((item) => item.classList.toggle("active", item === tab));
    tabPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.id === `tab-${tabId}`);
    });
  });
});
