import request from 'request';
import cheerio from 'cheerio';
import sqlite3 from 'sqlite3';
import HashMap from 'hashmap';

const baseURL = "http://www.matsmart.se";
const TIMESTAMP_NOW = Math.round(new Date().getTime() / 1000);

function newItem(id, categories, url, img_url, name, price, discount, first_seen, last_seen) {
  return {
    id,
    categories,
    url,
    img_url,
    name,
    price,
    discount,
    first_seen,
    last_seen
  };
}

function newCategory(id, url, title) {
  return {
    id,
    url,
    title
  };
}

function parseItem($, element, categoryId) {
  const itemURL = element.attribs.href;
  const itemImageURL = "http:" + $(element).find("img.zoom").first()[0].attribs.src.replace(/\?itok=.*/g, '');
  const name = $(element).find("span.prd-name").first().text().replace(/^\s+|\s+$/g, '');
  const price = $(element).find("div.prd-price-num").first().text().match(/\d+/)[0]; //FIXME doesn't understand that it's a sum price
  const discount = $(element).find("span.prd-discount-oldprice > span").first().text().replace(/^[^\(]+..|..[^\)]+$/g, '');

  return newItem(-1, [categoryId], itemURL, itemImageURL, name, price, discount, TIMESTAMP_NOW, TIMESTAMP_NOW);
}

function resolveCategories(rows) {
  let categories = [];
  rows.forEach(function(row) {
    const categoryId = row.id;
    if (!(row.id == 4 || row.id == 0)) {
      return true; // Be nice when developing, only process two categories
    }
    categories.push(newCategory(row.id, row.url, row.title));
  });
  return categories;
}

function promisesForFetchingItems(categories) {
  let tasks = [];
  categories.forEach(function(category) {
    var promise = new Promise((resolve, reject) => {
      const url = baseURL + category.url;
      request(url, function(error, response, html) {
        if (error) {
          reject(error);
          return;
        }
        const $ = cheerio.load(html);
        const products = $("div.prd > a");
        let items = [];
        products.each(function(id, element) {
          let item = parseItem($, element, category.id);
          items.push(item);
        });
        resolve(items);
      });
    });
    tasks.push(promise);
  });
  return tasks;
}

function translateToMap(dbItems) {
  let map = new HashMap();
  dbItems.forEach(function(item) {
    map.set(item.url, item);
  });
  return map;
}

function fetchItemsFromDb(db) {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM items", function(err, rows) {
      if (err) {
        reject(err);
      }
      let items = [];
      rows.forEach(function(row) {
        let item = newItem(row.id, row.categories.split(","), row.url, row.img_url, row.name, row.price, row.discount, row.first_seen, row.last_seen);
        items.push(item);
      });
      resolve(translateToMap(items));
    });
  });
}

function flatMapCombineCategories(categoryItems) {
  let url2item = new HashMap();

  categoryItems.forEach(function(itemsForCategory) {
    itemsForCategory.forEach(function(itemSingleCategory) {
      let itemFromMap = url2item.get(itemSingleCategory.url);
      if (itemFromMap == undefined) {
        url2item.set(itemSingleCategory.url, itemSingleCategory);
      } else {
        itemFromMap.categories.push(itemSingleCategory.categories[0]);
      }
    });
  });

  return url2item.values();
}

function fetchItemsFromMatsmart(db) {
  return new Promise((resolve, reject) => {
    db.all("SELECT id, url, title FROM categories", function(err, rows) {
      if (err) {
        reject(err);
      }
      let categories = resolveCategories(rows);
      let tasks = promisesForFetchingItems(categories);

      Promise.all(tasks).then(values => {
        try {
          resolve(flatMapCombineCategories(values));
        } catch (err) {
          reject(err);
        }
      }, fail => {
        reject(fail);
      });
    });
  });
}

function mergeProcessItems(db, dbItems, matsmartItems) {
  return new Promise((resolve, reject) => {
    db.serialize(function() {
      db.run("BEGIN TRANSACTION");
      let stmt = db.prepare("INSERT INTO items (categories, url, img_url, name, price, discount, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

      matsmartItems.forEach(function(item) {
        //stmt.run(item.categories.join(","), item.url, item.img_url, item.name, item.price, item.discount, item.first_seen, item.last_seen);
      });

      stmt.finalize();
      db.run("COMMIT");

      resolve("TODO diff dbItems with matsmartItems and update DB as needed.");
    });
  });
}

// stub item
// INSERT INTO items (category_id, url, img_url, name, price, discount, first_seen, last_seen) VALUES (1, 'my_url', 'my_img_url', 'my_name', 49.50, 10, datetime(CURRENT_TIMESTAMP,'localtime'), datetime(CURRENT_TIMESTAMP,'localtime'))

async function execute() {
  let db = new sqlite3.Database("matsmartare.db");

  const dbItems = await fetchItemsFromDb(db);
  console.log("Items in db: " + dbItems.count());

  const matsmartItems = await fetchItemsFromMatsmart(db);
  console.log("Items from web: " + matsmartItems.length);

  const result = await mergeProcessItems(db, dbItems, matsmartItems);
  console.log("Result: " + result);

  db.close();
}

execute();
