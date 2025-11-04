import fetch from "node-fetch";
import fs from "fs";

const SUPPLIER_URL = "https://tools.by/api/eshop-export/01JY753R7760ZCNXR0F7G2FKZT?format=csv";

async function downloadSupplierPrice() {
  console.log("Скачиваю прайс поставщика...");

  const response = await fetch(SUPPLIER_URL);
  if (!response.ok) {
    console.error("Ошибка при загрузке файла:", response.statusText);
    return;
  }

  const csvData = await response.text();

  // Сохраняем в файл
  fs.writeFileSync("supplier-price.csv", csvData);
  console.log("Прайс сохранён как supplier-price.csv");

  // Выводим первые 5 строк
  console.log("\nПример данных из файла:");
  console.log(csvData.split("\n").slice(0, 5).join("\n"));
}

downloadSupplierPrice();
