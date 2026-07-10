const input = document.getElementById("token");
const status = document.getElementById("status");

chrome.storage.local.get("smartbcLeadsToken", (data) => {
  if (data.smartbcLeadsToken) input.value = data.smartbcLeadsToken;
});

document.getElementById("save").addEventListener("click", () => {
  const token = input.value.trim();
  chrome.storage.local.set({ smartbcLeadsToken: token }, () => {
    status.textContent = token ? "Guardado ✓" : "Token vacío guardado (captura desactivada)";
    setTimeout(() => (status.textContent = ""), 3000);
  });
});
