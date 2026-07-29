/* global migrate, Collection, SelectField, EditorField, RelationField, TextField */
migrate((app) => {
  const categories = new Collection({
    id: "pbc_categories1",
    name: "categories",
    type: "base",
    listRule: "owner = @request.auth.id",
    viewRule: "owner = @request.auth.id",
    createRule: "@request.auth.id != '' && owner = @request.auth.id",
    updateRule: "owner = @request.auth.id && @request.body.owner:changed = false",
    deleteRule: "owner = @request.auth.id",
    fields: [
      { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: "_pb_users_auth_", cascadeDelete: true },
      { name: "name", type: "text", required: true, min: 1, max: 40 },
      { name: "color", type: "select", required: true, maxSelect: 1, values: ["slate", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink"] },
    ],
    indexes: [
      "CREATE INDEX idx_categories_owner ON categories (owner)",
      "CREATE UNIQUE INDEX idx_categories_owner_name_nocase ON categories (owner, name COLLATE NOCASE)",
    ],
  });
  app.save(categories);

  const projects = app.findCollectionByNameOrId("projects");
  projects.fields.add(new SelectField({ name: "status", values: ["planned", "active", "on_hold", "completed"], maxSelect: 1 }));
  projects.fields.add(new TextField({ name: "dueDate", max: 10, pattern: "^$|^[0-9]{4}-[0-9]{2}-[0-9]{2}$" }));
  app.save(projects);

  const tasks = app.findCollectionByNameOrId("tasks");
  tasks.fields.add(new EditorField({ name: "description", maxSize: 100000 }));
  tasks.fields.add(new SelectField({ name: "priority", values: ["none", "low", "medium", "high", "urgent"], maxSelect: 1 }));
  tasks.fields.add(new RelationField({ name: "category", collectionId: categories.id, maxSelect: 1 }));
  tasks.createRule += " && (category = '' || category.owner = @request.auth.id)";
  tasks.updateRule += " && (category = '' || category.owner = @request.auth.id)";
  app.save(tasks);

  app.db().newQuery("UPDATE projects SET status = 'active' WHERE status = '' OR status IS NULL").execute();
  app.db().newQuery("UPDATE tasks SET priority = 'none' WHERE priority = '' OR priority IS NULL").execute();
}, (app) => {
  const tasks = app.findCollectionByNameOrId("tasks");
  for (const name of ["description", "priority", "category"]) tasks.fields.removeByName(name);
  tasks.createRule = tasks.createRule.replace(" && (category = '' || category.owner = @request.auth.id)", "");
  tasks.updateRule = tasks.updateRule.replace(" && (category = '' || category.owner = @request.auth.id)", "");
  app.save(tasks);

  const projects = app.findCollectionByNameOrId("projects");
  projects.fields.removeByName("status");
  projects.fields.removeByName("dueDate");
  app.save(projects);

  app.delete(app.findCollectionByNameOrId("categories"));
});
