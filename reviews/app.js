const cards = document.getElementById("cards");
const filter = document.getElementById("filter");

function render(category = "all") {
  cards.innerHTML = "";
  PRODUCTS.forEach(p => {
    if (category !== "all" && p.category !== category) return;

    cards.innerHTML += `
      <div class="card">
        ${p.badge ? `<span class="badge">${p.badge}</span>` : ""}
        <img src="${p.image}">
        <h3>${p.name}</h3>
        <p>${p.farm}</p>
        <a href="product.html?id=${p.id}">Voir</a>
      </div>
    `;
  });
}

filter.addEventListener("change", e => render(e.target.value));
render();
