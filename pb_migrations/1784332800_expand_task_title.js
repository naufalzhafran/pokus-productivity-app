/* global migrate */

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("tasks");
    collection.fields.getByName("title").max = 2000;
    return app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("tasks");
    collection.fields.getByName("title").max = 120;
    return app.save(collection);
  },
);
