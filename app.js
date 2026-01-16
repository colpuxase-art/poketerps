const tg = window.Telegram.WebApp;
tg.expand();

fetch("/api/pokemons")
  .then(res => res.json())
  .then(pokemons => {
    const list = document.getElementById("list");

    pokemons.forEach(p => {
      const div = document.createElement("div");
      div.innerHTML = `<h3>${p.name}</h3>⭐ ${p.rating}`;
      list.appendChild(div);
    });
  });
