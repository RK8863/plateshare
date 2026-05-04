const storageKey = "plateshare-state-v2";

const seedOffers = [
  {
    id: createId(),
    foodName: "Fresh vegetable pulao trays",
    portions: 40,
    foodType: "Cooked meal",
    location: "Koramangala event hall",
    availableUntil: getClockTime(150),
    contact: "Anika, kitchen lead",
    safetyNotes: "Prepared at 5 PM. Vegetarian. Contains cashew and dairy.",
    status: "available",
  },
  {
    id: createId(),
    foodName: "Bananas and sealed bread packs",
    portions: 65,
    foodType: "Produce",
    location: "MG Road grocery partner",
    availableUntil: getClockTime(210),
    contact: "Store desk",
    safetyNotes: "Unopened bread packs. Fruit is ripe and best moved today.",
    status: "claimed",
  },
  {
    id: createId(),
    foodName: "Packed lemon rice boxes",
    portions: 28,
    foodType: "Cooked meal",
    location: "Whitefield office cafeteria",
    availableUntil: getClockTime(70),
    contact: "Facilities team",
    safetyNotes: "Individually packed. No onion or garlic.",
    status: "available",
  },
];

let state = loadState();
let activeFilter = "all";

const elements = {
  form: document.querySelector("#offer-form"),
  foodName: document.querySelector("#food-name"),
  portions: document.querySelector("#portions"),
  foodType: document.querySelector("#food-type"),
  location: document.querySelector("#location"),
  availableUntil: document.querySelector("#available-until"),
  contact: document.querySelector("#contact"),
  safetyNotes: document.querySelector("#safety-notes"),
  offerList: document.querySelector("#offer-list"),
  offerTemplate: document.querySelector("#offer-template"),
  emptyState: document.querySelector("#empty-state"),
  filterButtons: document.querySelectorAll(".filter-button"),
  heroPickups: document.querySelector("#hero-pickups"),
  heroNext: document.querySelector("#hero-next"),
  metricMeals: document.querySelector("#metric-meals"),
  metricClaimed: document.querySelector("#metric-claimed"),
  metricUrgent: document.querySelector("#metric-urgent"),
};

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getClockTime(minutesFromNow) {
  const date = new Date(Date.now() + minutesFromNow * 60000);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function loadState() {
  const saved = localStorage.getItem(storageKey);

  if (!saved) {
    return { offers: seedOffers };
  }

  try {
    const parsed = JSON.parse(saved);
    return {
      offers: Array.isArray(parsed.offers) ? parsed.offers : seedOffers,
    };
  } catch {
    return { offers: seedOffers };
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function render() {
  const visibleOffers = getVisibleOffers();
  elements.offerList.replaceChildren();
  elements.emptyState.classList.toggle("is-visible", visibleOffers.length === 0);

  visibleOffers.forEach((offer) => {
    elements.offerList.append(createOfferCard(offer));
  });

  renderMetrics();
  saveState();
}

function getVisibleOffers() {
  const ranked = [...state.offers].sort((a, b) => {
    const statusRank = statusWeight(a.status) - statusWeight(b.status);
    return statusRank || minutesUntil(a.availableUntil) - minutesUntil(b.availableUntil);
  });

  if (activeFilter === "all") {
    return ranked;
  }

  return ranked.filter((offer) => offer.status === activeFilter);
}

function statusWeight(status) {
  return { available: 0, claimed: 1, delivered: 2 }[status] ?? 3;
}

function createOfferCard(offer) {
  const card = elements.offerTemplate.content.firstElementChild.cloneNode(true);
  const statusPill = card.querySelector(".status-pill");
  const timePill = card.querySelector(".time-pill");
  const claimButton = card.querySelector(".claim-button");
  const completeButton = card.querySelector(".complete-button");
  const removeButton = card.querySelector(".remove-button");

  card.dataset.status = offer.status;
  card.querySelector("h3").textContent = offer.foodName;
  card.querySelector(".fact-portions").textContent = offer.portions;
  card.querySelector(".fact-type").textContent = offer.foodType;
  card.querySelector(".fact-location").textContent = offer.location;
  card.querySelector(".fact-contact").textContent = offer.contact;
  card.querySelector(".safety-copy").textContent = offer.safetyNotes || "No extra safety notes added.";

  statusPill.textContent = getStatusLabel(offer.status);
  statusPill.dataset.status = offer.status;
  timePill.textContent = getPickupText(offer.availableUntil);
  timePill.dataset.urgent = minutesUntil(offer.availableUntil) <= 90;

  claimButton.disabled = offer.status !== "available";
  completeButton.disabled = offer.status === "delivered";

  claimButton.addEventListener("click", () => updateOfferStatus(offer.id, "claimed"));
  completeButton.addEventListener("click", () => updateOfferStatus(offer.id, "delivered"));
  removeButton.addEventListener("click", () => removeOffer(offer.id));

  return card;
}

function getStatusLabel(status) {
  return {
    available: "Open",
    claimed: "Claimed",
    delivered: "Delivered",
  }[status] ?? "Unknown";
}

function getPickupText(time) {
  const minutes = minutesUntil(time);

  if (minutes < 0) {
    return `Expired at ${formatTime(time)}`;
  }

  if (minutes < 60) {
    return `${minutes} min left`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} hr left` : `${hours} hr ${remainder} min left`;
}

function minutesUntil(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const now = new Date();
  const target = new Date();

  target.setHours(hours, minutes, 0, 0);

  if (target < now) {
    target.setDate(target.getDate() + 1);
  }

  return Math.round((target - now) / 60000);
}

function formatTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function renderMetrics() {
  const available = state.offers.filter((offer) => offer.status === "available");
  const claimed = state.offers.filter((offer) => offer.status === "claimed");
  const urgent = available.filter((offer) => minutesUntil(offer.availableUntil) <= 90);
  const meals = available.reduce((sum, offer) => sum + Number(offer.portions), 0);
  const nextOffer = available.sort((a, b) => minutesUntil(a.availableUntil) - minutesUntil(b.availableUntil))[0];

  elements.metricMeals.textContent = meals;
  elements.metricClaimed.textContent = claimed.length;
  elements.metricUrgent.textContent = urgent.length;
  elements.heroPickups.textContent = `${available.length} ${available.length === 1 ? "offer" : "offers"} nearby`;
  elements.heroNext.textContent = nextOffer
    ? `${nextOffer.foodName} needs pickup by ${formatTime(nextOffer.availableUntil)}.`
    : "No open pickups right now. Check claimed deliveries or post a new offer.";
}

function updateOfferStatus(id, status) {
  state.offers = state.offers.map((offer) => (offer.id === id ? { ...offer, status } : offer));
  render();
}

function removeOffer(id) {
  state.offers = state.offers.filter((offer) => offer.id !== id);
  render();
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();

  state.offers.unshift({
    id: createId(),
    foodName: elements.foodName.value.trim(),
    portions: Number(elements.portions.value),
    foodType: elements.foodType.value,
    location: elements.location.value.trim(),
    availableUntil: elements.availableUntil.value,
    contact: elements.contact.value.trim(),
    safetyNotes: elements.safetyNotes.value.trim(),
    status: "available",
  });

  elements.form.reset();
  elements.foodName.focus();
  render();
});

elements.filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    elements.filterButtons.forEach((candidate) => {
      candidate.classList.toggle("is-active", candidate === button);
    });
    render();
  });
});

render();
