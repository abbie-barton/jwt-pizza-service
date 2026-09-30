const request = require("supertest");
const app = require("../service");

let adminUserAuthToken;

const { Role, DB } = require("../database/database.js");

async function createAdminUser() {
  let user = { password: "toomanysecrets", roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + "@admin.com";

  user = await DB.addUser(user);
  return { ...user, password: "toomanysecrets" };
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

beforeAll(async () => {
  const admin = await createAdminUser();
  const loginRes = await request(app).put("/api/auth").send(admin);
  adminUserAuthToken = loginRes.body.token;
});

test("get menu", async () => {
  const getRes = await request(app).get("/api/order/menu");

  expect(getRes.status).toBe(200);
  expect(getRes.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: expect.any(Number),
        title: expect.any(String),
        image: expect.any(String),
        price: expect.any(Number),
        description: expect.any(String),
      }),
    ]),
  );
});

test("add item to menu", async () => {
  const item = {
    title: "new menu item",
    image: "",
    description: "it's new",
    price: "0.0001",
  };
  const createRes = await request(app)
    .put("/api/order/menu")
    .set("Authorization", `Bearer ${adminUserAuthToken}`)
    .send(item);

  expect(createRes.status).toBe(200);
});

test("get orders", async () => {
  const getRes = await request(app)
    .get("/api/order")
    .set("Authorization", `Bearer ${adminUserAuthToken}`);

  expect(getRes.status).toBe(200);
  expect(getRes.body).toEqual(
    expect.objectContaining({
      dinerId: expect.any(Number),
      orders: expect.any(Array),
    }),
  );
});

test("create an order", async () => {
  const order = {
    franchiseId: 1,
    storeId: 1,
    items: [{ menuId: 1, description: "Veggie", price: 0.05 }],
  };

  const createRes = await request(app)
    .post("/api/order")
    .set("Authorization", `Bearer ${adminUserAuthToken}`)
    .send(order);

  expect(createRes.status).toBe(200);
});
