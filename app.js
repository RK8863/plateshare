const storageKey = "plateshare-state-v3";
const tableName = "offers";

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
    createdAt: new Date().toISOString(),
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
    createdAt: new Date().toISOString(),
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
    createdAt: new Date().toISOString(),
  },
];

let state = { offers: [] };
let activeFilter = "all";
let dataMode = "local";
let supabaseClient = null;
let realtimeChannel = null;

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
  connectionStatus: document.querySelector("#connection-status"),
};

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getClockTime(minutesFromNow) {
  const date = new Date(Date.now() + minutesFromNow * 60000);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

async function init() {
  configureDataSource();
  setConnectionStatus("loading", dataMode === "supabase" ? "Connecting to Supabase" : "Local demo mode");
  await loadOffers();
  subscribeToChanges();
  render();
}

function configureDataSource() {
  const config = window.PLATESHARE_SUPABASE ?? {};
  const hasSupabaseConfig = Boolean(config.url && config.anonKey);
  const hasClient = Boolean(window.supabase?.createClient);

  if (hasSupabaseConfig && hasClient) {
    supabaseClient = window.supabase.createClient(config.url, config.anonKey);
    dataMode = "supabase";
    return;
  }

  dataMode = "local";
}

async function loadOffers() {
  if (dataMode === "supabase") {
    const { data, error } = await supabaseClient
      .from(tableName)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      dataMode = "local";
      state = loadLocalState();
      setConnectionStatus("offline", "Supabase error, using local demo");
      return;
    }

    state = { offers: data.map(fromDatabaseOffer) };
    setConnectionStatus("online", "Shared Supabase data");
    return;
  }

  state = loadLocalState();
  setConnectionStatus("offline", "Local demo data only");
}

function loadLocalState() {
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

function saveLocalState() {
  if (dataMode === "local") {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }
}

function subscribeToChanges() {
  if (dataMode !== "supabase" || realtimeChannel) {
    return;
  }

  realtimeChannel = supabaseClient
    .channel("public:offers")
    .on("postgres_changes", { event: "*", schema: "public", table: tableName }, async () => {
      await loadOffers();
      render();
    })
    .subscribe();
}

function render() {
  const visibleOffers = getVisibleOffers();
  elements.offerList.replaceChildren();
  elements.emptyState.classList.toggle("is-visible", visibleOffers.length === 0);

  visibleOffers.forEach((offer) => {
    elements.offerList.append(createOfferCard(offer));
  });

  renderMetrics();
  saveLocalState();
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
  const nextOffer = [...available].sort((a, b) => minutesUntil(a.availableUntil) - minutesUntil(b.availableUntil))[0];

  elements.metricMeals.textContent = meals;
  elements.metricClaimed.textContent = claimed.length;
  elements.metricUrgent.textContent = urgent.length;
  elements.heroPickups.textContent = `${available.length} ${available.length === 1 ? "offer" : "offers"} nearby`;
  elements.heroNext.textContent = nextOffer
    ? `${nextOffer.foodName} needs pickup by ${formatTime(nextOffer.availableUntil)}.`
    : "No open pickups right now. Check claimed deliveries or post a new offer.";
}

async function addOffer(offer) {
  if (dataMode === "supabase") {
    const { error } = await supabaseClient.from(tableName).insert(toDatabaseOffer(offer));

    if (error) {
      console.error(error);
      setConnectionStatus("offline", "Could not post to Supabase");
      return;
    }

    await loadOffers();
    render();
    return;
  }

  state.offers.unshift(offer);
  render();
}

async function updateOfferStatus(id, status) {
  if (dataMode === "supabase") {
    const { error } = await supabaseClient.from(tableName).update({ status }).eq("id", id);

    if (error) {
      console.error(error);
      setConnectionStatus("offline", "Could not update Supabase");
      return;
    }

    await loadOffers();
    render();
    return;
  }

  state.offers = state.offers.map((offer) => (offer.id === id ? { ...offer, status } : offer));
  render();
}

async function removeOffer(id) {
  if (dataMode === "supabase") {
    const { error } = await supabaseClient.from(tableName).delete().eq("id", id);

    if (error) {
      console.error(error);
      setConnectionStatus("offline", "Could not remove from Supabase");
      return;
    }

    await loadOffers();
    render();
    return;
  }

  state.offers = state.offers.filter((offer) => offer.id !== id);
  render();
}

function toDatabaseOffer(offer) {
  return {
    food_name: offer.foodName,
    portions: offer.portions,
    food_type: offer.foodType,
    pickup_location: offer.location,
    available_until: offer.availableUntil,
    contact: offer.contact,
    safety_notes: offer.safetyNotes,
    status: offer.status,
  };
}

function fromDatabaseOffer(offer) {
  return {
    id: offer.id,
    foodName: offer.food_name,
    portions: offer.portions,
    foodType: offer.food_type,
    location: offer.pickup_location,
    availableUntil: offer.available_until.slice(0, 5),
    contact: offer.contact,
    safetyNotes: offer.safety_notes,
    status: offer.status,
    createdAt: offer.created_at,
  };
}

function setConnectionStatus(status, text) {
  elements.connectionStatus.dataset.status = status;
  elements.connectionStatus.textContent = text;
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  await addOffer({
    id: createId(),
    foodName: elements.foodName.value.trim(),
    portions: Number(elements.portions.value),
    foodType: elements.foodType.value,
    location: elements.location.value.trim(),
    availableUntil: elements.availableUntil.value,
    contact: elements.contact.value.trim(),
    safetyNotes: elements.safetyNotes.value.trim(),
    status: "available",
    createdAt: new Date().toISOString(),
  });

  elements.form.reset();
  elements.foodName.focus();
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

init();
