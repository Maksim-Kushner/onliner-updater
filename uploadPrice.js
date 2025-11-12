// import fetch from "node-fetch";
// import fs from "fs";
// import { parse } from "csv-parse/sync";

// // === Настройки OAuth2 из окружения Actions ===
// const CLIENT_ID = process.env.ONLINER_CLIENT_ID;
// const CLIENT_SECRET = process.env.ONLINER_CLIENT_SECRET;

// if (!CLIENT_ID || !CLIENT_SECRET) {
//   throw new Error("Не заданы переменные ONLINER_CLIENT_ID или ONLINER_CLIENT_SECRET в окружении GitHub Actions");
// }

// // === 1️⃣ Получаем токен ===
// async function getAccessToken() {
//   const res = await fetch("https://b2bapi.onliner.by/oauth/token", {
//     method: "POST",
//     headers: {
//       "Authorization": "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
//       "Accept": "application/json",
//     },
//     body: new URLSearchParams({ grant_type: "client_credentials" }),
//   });

//   if (!res.ok) {
//     throw new Error(`Ошибка получения токена: ${res.status} ${res.statusText}`);
//   }

//   const data = await res.json();
//   return data.access_token;
// }

// // === 2️⃣ Подготавливаем CSV с актуальными ценами ===
// function prepareCsv(resetFilePath, supplierFilePath, outputFilePath) {
//   const resetCsv = fs.readFileSync(resetFilePath, "utf-8");
//   const resetRecords = parse(resetCsv, { columns: true, delimiter: ";" });

//   const supplierCsv = fs.readFileSync(supplierFilePath, "utf-8");
//   const supplierRecords = parse(supplierCsv, { columns: true, delimiter: ";" });

//   const priceMap = new Map();
//   supplierRecords.forEach(r => priceMap.set(r.vendor_code, r.price));

//   const updatedRecords = resetRecords.map(r => {
//     const newPrice = priceMap.get(r["Артикул"]);
//     if (newPrice) r["Цена"] = newPrice;
//     return r;
//   });

//   const headers = Object.keys(updatedRecords[0]);
//   const lines = [headers.join(";")];
//   updatedRecords.forEach(r => lines.push(headers.map(h => r[h]).join(";")));

//   const outputCsv = lines.join("\n");
//   fs.writeFileSync(outputFilePath, outputCsv, { encoding: "utf8" });
//   console.log(`Подготовленный CSV сохранён как ${outputFilePath}`);
//   return outputCsv;
// }

// // === 3️⃣ Отправка CSV на Onliner ===
// async function uploadPrice(token, csvData) {
//   const response = await fetch("https://price.api.onliner.by/pricelists", {
//     method: "PUT",
//     headers: {
//       "Authorization": `Bearer ${token}`,
//       "Accept": "application/json",
//       "Content-Type": "text/csv; charset=utf-8",
//     },
//     body: csvData,
//   });

//   console.log("HTTP статус:", response.status, response.statusText);

//   const contentType = response.headers.get("content-type");
//   let body;
//   if (contentType && contentType.includes("application/json")) {
//     body = await response.json();
//   } else {
//     body = await response.text();
//   }

//   console.log("Ответ Onliner:", body);
// }

// // === 4️⃣ Главная функция ===
// (async () => {
//   try {
//     const token = await getAccessToken();

//     const finalCsv = prepareCsv("price-reset.csv", "supplier-price.csv", "price-ready.csv");

//     console.log("Загружаем подготовленный прайс на Onliner...");
//     await uploadPrice(token, finalCsv);

//     console.log("Готово! Прайс отправлен одним файлом.");
//   } catch (err) {
//     console.error("Ошибка:", err);
//   }
// })();

import fetch from "node-fetch";
import fs from "fs";
import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import chardet from "chardet";

// === Настройки OAuth2 ===
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

// === Вспомогательная функция автоопределения разделителя ===
function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).slice(0, 5);
  const delimiters = [";", ",", "\t"];
  const counts = delimiters.map(d => (lines[0].split(d).length));
  const maxIndex = counts.indexOf(Math.max(...counts));
  return delimiters[maxIndex] || ";";
}

// === Автоопределение кодировки ===
function readFileSmart(filePath) {
  const buffer = fs.readFileSync(filePath);
  const detected = chardet.detect(buffer) || "UTF-8";
  const decoded = iconv.decode(buffer, detected);
  return decoded.replace(/^\uFEFF/, ""); // убираем BOM
}

// === 2️⃣ Подготавливаем CSV с актуальными ценами ===
function prepareCsv(resetFilePath, supplierFilePath, outputFilePath) {
  // --- Читаем файлы с автоопределением кодировки ---
  const resetCsv = readFileSmart(resetFilePath);
  const supplierCsv = readFileSmart(supplierFilePath);

  // --- Определяем разделители ---
  const resetDelimiter = detectDelimiter(resetCsv);
  const supplierDelimiter = detectDelimiter(supplierCsv);
  console.log(`Разделители: reset="${resetDelimiter}" supplier="${supplierDelimiter}"`);

  // --- Парсим ---
  const resetRecords = parse(resetCsv, {
    columns: header => header.map(h => h.trim()),
    delimiter: resetDelimiter,
    skip_empty_lines: true
  });

  const supplierRecords = parse(supplierCsv, {
    columns: header => header.map(h => h.trim()),
    delimiter: supplierDelimiter,
    skip_empty_lines: true
  });

  // --- Создаём карту vendor_code → price ---
  const priceMap = new Map();
  supplierRecords.forEach(r => {
    const code = r.vendor_code?.trim();
    const price = r.price?.trim();
    if (code && price) priceMap.set(code, price);
  });

  // --- Обновляем цены ---
  let updatedCount = 0;
  const updatedRecords = resetRecords.map(r => {
    const art = (r["Артикул"] || "").trim();
    const newPrice = priceMap.get(art);
    if (newPrice) {
      r["Цена"] = newPrice;
      updatedCount++;
    }
    return r;
  });

  // --- Собираем итоговый CSV ---
  const headers = Object.keys(updatedRecords[0]);
  const lines = [headers.join(";")];
  updatedRecords.forEach(r => lines.push(headers.map(h => (r[h] ?? "")).join(";")));
  const outputCsv = lines.join("\n");

  fs.writeFileSync(outputFilePath, outputCsv, "utf8");
  console.log(`✅ CSV готов: ${outputFilePath}`);
  console.log(`🔄 Обновлено товаров: ${updatedCount}`);
  return outputCsv;
}

// === 3️⃣ Отправляем CSV на Onliner ===
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
  const body = contentType?.includes("application/json")
    ? await response.json()
    : await response.text();

  console.log("Ответ Onliner:", body);
}

// === 4️⃣ Главная функция ===
(async () => {
  try {
    const token = await getAccessToken();

    const finalCsv = prepareCsv("price-reset.csv", "supplier-price.csv", "price-ready.csv");

    console.log("Загружаем подготовленный прайс на Onliner...");
    await uploadPrice(token, finalCsv);

    console.log("✅ Готово! Прайс успешно отправлен.");
  } catch (err) {
    console.error("❌ Ошибка:", err);
  }
})();

