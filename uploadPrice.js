import fetch from "node-fetch";
import fs from "fs";
import { parse } from "csv-parse/sync";

// === Настройки OAuth2 из окружения Actions ===
const CLIENT_ID = process.env.ONLINER_CLIENT_ID;
const CLIENT_SECRET = process.env.ONLINER_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error("Не заданы переменные ONLINER_CLIENT_ID или ONLINER_CLIENT_SECRET в окружении GitHub Actions");
}

// === 1️⃣ Получаем токен ===
async function getAccessToken() {
  const res = await fetch("https://b2bapi.onliner.by/oauth/token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
      "Accept": "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!res.ok) {
    throw new Error(`Ошибка получения токена: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.access_token;
}

// === 2️⃣ Подготавливаем CSV с актуальными ценами ===
function prepareCsv(resetFilePath, supplierFilePath, outputFilePath) {
  const resetCsv = fs.readFileSync(resetFilePath, "utf-8");
  const resetRecords = parse(resetCsv, { columns: true, delimiter: ";" });

  const supplierCsv = fs.readFileSync(supplierFilePath, "utf-8");
  const supplierRecords = parse(supplierCsv, { columns: true, delimiter: ";" });

  const priceMap = new Map();
  supplierRecords.forEach(r => priceMap.set(r.vendor_code, r.price_recommended));

  const updatedRecords = resetRecords.map(r => {
    const newPrice = priceMap.get(r["Артикул"]);
    if (newPrice) r["Цена"] = newPrice;
    return r;
  });

  const headers = Object.keys(updatedRecords[0]);
  const lines = [headers.join(";")];
  updatedRecords.forEach(r => lines.push(headers.map(h => r[h]).join(";")));

  const outputCsv = lines.join("\n");
  fs.writeFileSync(outputFilePath, outputCsv, { encoding: "utf8" });
  console.log(`Подготовленный CSV сохранён как ${outputFilePath}`);
  return outputCsv;
}

// === 3️⃣ Отправка CSV на Onliner ===
async function uploadPrice(token, csvData) {
  const response = await fetch("https://price.api.onliner.by/pricelists", {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
      "Content-Type": "text/csv; charset=utf-8",
    },
    body: csvData,
  });

  console.log("HTTP статус:", response.status, response.statusText);

  const contentType = response.headers.get("content-type");
  let body;
  if (contentType && contentType.includes("application/json")) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  console.log("Ответ Onliner:", body);
}

// === 4️⃣ Главная функция ===
(async () => {
  try {
    const token = await getAccessToken();

    const finalCsv = prepareCsv("price-reset.csv", "supplier-price.csv", "price-ready.csv");

    console.log("Загружаем подготовленный прайс на Onliner...");
    await uploadPrice(token, finalCsv);

    console.log("Готово! Прайс отправлен одним файлом.");
  } catch (err) {
    console.error("Ошибка:", err);
  }
})();

