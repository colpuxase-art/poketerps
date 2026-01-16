const tg = window.Telegram.WebApp;
tg.expand();

fetch("/api/pokemons")
  .then(res => res.json())
  .then(pokemons => {
    const container = document.getElementById("pokemon-list");

    pokemons.forEach(p => {
      const card = document.createElement("div");
      card.className = "card mb-4";

      card.innerHTML = `
        <img class="card-img-top" src="${p.image}" alt="${p.name}">
        <div class="card-body">
          <h2 class="card-title">${p.name}</h2>
          <p>⭐ ${"★".repeat(p.rating)}${"☆".repeat(5 - p.rating)}</p>
          <p class="card-text">${p.description}</p>
        </div>
      `;

      container.appendChild(card);
    });
  });
