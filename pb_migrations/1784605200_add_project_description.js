/* global EditorField, migrate */

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("projects");
    collection.fields.add(
      new EditorField({
        id: "editor2621679773",
        name: "description",
        maxSize: 100000,
      }),
    );
    return app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("projects");
    collection.fields.removeByName("description");
    return app.save(collection);
  },
);
