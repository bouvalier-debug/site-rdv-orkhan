(function nouveautesCarousel() {
  "use strict";
  const list = document.getElementById("nouveautes-list");
  const previous = document.querySelector("[data-carousel-prev]");
  const next = document.querySelector("[data-carousel-next]");
  if (!list || !previous || !next) return;

  function update() {
    const end = Math.max(0, list.scrollWidth - list.clientWidth);
    previous.disabled = list.scrollLeft <= 1;
    next.disabled = list.scrollLeft >= end - 1;
  }

  function move(direction) {
    const card = list.querySelector(".product-tile");
    if (!card) return;
    const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
    list.scrollBy({ left: direction * (card.getBoundingClientRect().width + gap), behavior: "smooth" });
  }

  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  list.addEventListener("scroll", update, { passive: true });
  list.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    move(event.key === "ArrowLeft" ? -1 : 1);
  });
  window.addEventListener("resize", update);
  update();
}());
