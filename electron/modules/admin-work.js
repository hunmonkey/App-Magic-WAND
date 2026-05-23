const { app } = require("electron");
const fs = require("fs/promises");
const { getDataFileForRead, getDataFileForWrite } = require("../core/portable-data");

const DATA_FILE = "admin_work.json";

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeState(payload) {
  return {
    requests: Array.isArray(payload?.requests) ? payload.requests.map(normalizeRequest) : [],
    checklists: Array.isArray(payload?.checklists) ? payload.checklists.map(normalizeChecklist) : [],
    vendors: Array.isArray(payload?.vendors) ? payload.vendors.map(normalizeVendor) : [],
    supplies: Array.isArray(payload?.supplies) ? payload.supplies.map(normalizeSupply) : [],
    supplyLogs: Array.isArray(payload?.supplyLogs) ? payload.supplyLogs.map(normalizeSupplyLog) : [],
    purchases: Array.isArray(payload?.purchases) ? payload.purchases.map(normalizePurchase) : [],
    contracts: Array.isArray(payload?.contracts) ? payload.contracts.map(normalizeContract) : [],
    notes: Array.isArray(payload?.notes) ? payload.notes.map(normalizeNote) : [],
  };
}

function normalizeRequest(item) {
  return {
    id: text(item?.id) || makeId("req"),
    title: text(item?.title),
    requester: text(item?.requester),
    type: text(item?.type) || "일반",
    priority: text(item?.priority) || "일반",
    status: text(item?.status) || "접수",
    dueDate: text(item?.dueDate),
    detail: text(item?.detail),
    result: text(item?.result),
    updatedAt: text(item?.updatedAt),
  };
}

function normalizeChecklist(item) {
  const tasks = Array.isArray(item?.tasks) ? item.tasks : [];
  return {
    id: text(item?.id) || makeId("chk"),
    title: text(item?.title),
    owner: text(item?.owner),
    dueDate: text(item?.dueDate),
    status: text(item?.status) || "진행 중",
    tasks: tasks.map((task) => ({
      label: text(task?.label),
      done: task?.done === true,
    })).filter((task) => task.label),
    updatedAt: text(item?.updatedAt),
  };
}

function normalizeSupply(item) {
  const quantity = Number(item?.quantity);
  const minQuantity = Number(item?.minQuantity);
  const unitPrice = Number(item?.unitPrice);
  return {
    id: text(item?.id) || makeId("sup"),
    code: text(item?.code),
    name: text(item?.name),
    category: text(item?.category) || "소모품",
    unit: text(item?.unit) || "개",
    unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? Math.floor(unitPrice) : 0,
    vendorId: text(item?.vendorId),
    quantity: Number.isFinite(quantity) && quantity >= 0 ? Math.floor(quantity) : 0,
    minQuantity: Number.isFinite(minQuantity) && minQuantity >= 0 ? Math.floor(minQuantity) : 0,
    location: text(item?.location),
    memo: text(item?.memo),
    updatedAt: text(item?.updatedAt),
  };
}

function normalizeSupplyLog(item) {
  const quantity = Number(item?.quantity);
  const unitCost = Number(item?.unitCost);
  return {
    id: text(item?.id) || makeId("slog"),
    supplyId: text(item?.supplyId),
    date: text(item?.date),
    type: text(item?.type) || "in",
    quantity: Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1,
    reason: text(item?.reason),
    handler: text(item?.handler),
    vendorId: text(item?.vendorId),
    purchaseId: text(item?.purchaseId),
    unitCost: Number.isFinite(unitCost) && unitCost >= 0 ? Math.floor(unitCost) : 0,
    memo: text(item?.memo),
    createdAt: text(item?.createdAt),
  };
}

function normalizeVendor(item) {
  return {
    id: text(item?.id) || makeId("ven"),
    name: text(item?.name),
    businessNumber: text(item?.businessNumber),
    contactName: text(item?.contactName),
    phone: text(item?.phone),
    items: text(item?.items),
    rating: text(item?.rating) || "보통",
    recentDate: text(item?.recentDate),
    memo: text(item?.memo),
    active: item?.active !== false,
    updatedAt: text(item?.updatedAt),
  };
}

function normalizePurchase(item) {
  const quantity = Number(item?.quantity);
  const quotes = Array.isArray(item?.quotes) ? item.quotes : [];
  return {
    id: text(item?.id) || makeId("pur"),
    title: text(item?.title),
    requester: text(item?.requester),
    itemName: text(item?.itemName),
    quantity: Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1,
    unit: text(item?.unit) || "개",
    neededDate: text(item?.neededDate),
    status: text(item?.status) || "요청",
    linkedSupplyId: text(item?.linkedSupplyId),
    selectedVendorId: text(item?.selectedVendorId),
    reason: text(item?.reason),
    quotes: quotes.map(normalizeQuote).filter((quote) => quote.vendorId || quote.amount || quote.note),
    stockApplied: item?.stockApplied === true,
    updatedAt: text(item?.updatedAt),
  };
}

function normalizeQuote(item) {
  const amount = Number(item?.amount);
  const days = Number(item?.days);
  return {
    vendorId: text(item?.vendorId),
    amount: Number.isFinite(amount) && amount >= 0 ? Math.floor(amount) : 0,
    days: Number.isFinite(days) && days >= 0 ? Math.floor(days) : 0,
    note: text(item?.note),
  };
}

function normalizeContract(item) {
  return {
    id: text(item?.id) || makeId("ctr"),
    name: text(item?.name),
    vendor: text(item?.vendor),
    type: text(item?.type) || "계약",
    startDate: text(item?.startDate),
    expireDate: text(item?.expireDate),
    owner: text(item?.owner),
    amount: text(item?.amount),
    autoRenew: item?.autoRenew === true,
    filePath: text(item?.filePath),
    memo: text(item?.memo),
    updatedAt: text(item?.updatedAt),
  };
}

function normalizeNote(item) {
  return {
    id: text(item?.id) || makeId("note"),
    title: text(item?.title),
    relatedTo: text(item?.relatedTo),
    body: text(item?.body),
    updatedAt: text(item?.updatedAt),
  };
}

async function load() {
  try {
    const raw = await fs.readFile(await getDataFileForRead(app, DATA_FILE), "utf-8");
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") {
      return normalizeState({});
    }
    throw error;
  }
}

async function save(payload) {
  const state = normalizeState(payload);
  await fs.writeFile(await getDataFileForWrite(app, DATA_FILE), JSON.stringify(state, null, 2), "utf-8");
  return state;
}

function register(ipcMain) {
  ipcMain.handle("adminWork:load", () => load());
  ipcMain.handle("adminWork:save", (_event, payload) => save(payload));
}

module.exports = {
  register,
};
