import HashMap from 'hashmap';
import {
  newItem,
  newCategory
} from './models.js';

function translateToMap(dbItems) {
  let map = new HashMap();
  dbItems.forEach(function(item) {
    map.set(item.url, item);
  });
  return map;
}

function fetchItemsFromDb(db, asMap) {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM items WHERE last_seen=(SELECT MAX(last_seen) FROM items)", function(err, rows) {
      if (err) {
        reject(err);
      }
      let items = [];
      rows.forEach(function(row) {
        let item = newItem(row.id, row.categories.split(",").map(Number), row.url, row.img_url, row.name, row.price, row.discount, row.best_before, row.first_seen, row.last_seen);
        items.push(item);
      });
      if (asMap) {
        items = translateToMap(items);
      }
      resolve(items);
    });
  });
};

function resolveCategories(rows) {
  const categories = [];
  rows.forEach(function(row) {
    categories.push(newCategory(row.id, row.url, row.name));
  });
  return categories;
}

module.exports = {
  fetchItemsFromDb,
  resolveCategories
}
