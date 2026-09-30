const request = require("supertest");
const app = require("../service");

const dinerUser = { name: "pizza diner", email: "reg@test.com", password: "a" };
let dinerUserAuthToken;
let adminUserAuthToken;
let adminUser;
let adminUserId;
let date;
let testFranchiseId;
let testStoreId;

const { Role, DB } = require("../database/database.js");

async function createAdminUser() {
  let user = { password: "toomanysecrets", roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + "@admin.com";

  adminUser = await DB.addUser(user);
  return { ...adminUser, password: "toomanysecrets" };
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

beforeAll(async () => {
  dinerUser.email = Math.random().toString(36).substring(2, 12) + "@diner.com";
  const registerRes = await request(app).post("/api/auth").send(dinerUser);
  dinerUserAuthToken = registerRes.body.token;
  expectValidJwt(dinerUserAuthToken);

  const admin = await createAdminUser();
  const loginRes = await request(app).put("/api/auth").send(admin);
  adminUserAuthToken = loginRes.body.token;
  adminUserId = loginRes.body.user.id;

  date = Date.now();
});

test("create Franchise", async () => {
  const newFranchise = {
    name: "pizzaPocket" + date,
    admins: [{ email: adminUser.email }],
  };

  const createRes = await request(app)
    .post("/api/franchise")
    .set("Authorization", `Bearer ${adminUserAuthToken}`)
    .send(newFranchise);

  testFranchiseId = createRes.body.id;

  expect(createRes.status).toBe(200);
});

test("get list of franchises", async () => {
  const getRes = await request(app).get("/api/franchise");
  expect(getRes.body).toMatchObject({
    franchises: expect.arrayContaining([
      expect.objectContaining({
        id: expect.any(Number),
        name: expect.any(String),
        stores: expect.any(Array),
      }),
    ]),
    more: expect.any(Boolean),
  });
});

test("get user franchises", async () => {
  const getRes = await request(app)
    .get(`/api/franchise/${adminUserId}`)
    .set("Authorization", `Bearer ${adminUserAuthToken}`);

  expect(getRes.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: expect.any(Number),
        name: expect.any(String),
        admins: expect.any(Array),
        stores: expect.any(Array),
      }),
    ]),
  );
});

test("fail create Franchise", async () => {
  const newFranchise = {
    name: "pizzaPocket" + Date.now(),
    admins: [{ email: dinerUser.email }],
  };
  const createRes = await request(app)
    .post("/api/franchise")
    .set("Authorization", `Bearer ${dinerUserAuthToken}`)
    .send(newFranchise);

  expect(createRes.status).toBe(403);
});

test("create store", async () => {
  const store = { name: "new store" };

  const createRes = await request(app)
    .post(`/api/franchise/${testFranchiseId}/store`)
    .set("Authorization", `Bearer ${adminUserAuthToken}`)
    .send(store);

  testStoreId = createRes.body.id;

  expect(createRes.status).toBe(200);
});

test("delete store", async () => {
  const deleteRes = await request(app)
    .delete(`/api/franchise/${testFranchiseId}/store/${testStoreId}`)
    .set("Authorization", `Bearer ${adminUserAuthToken}`);

  expect(deleteRes.status).toBe(200);
});

test("delete franchise", async () => {
  const deleteRes = await request(app).delete(
    `/api/franchise/${testFranchiseId}`,
  );

  expect(deleteRes.status).toBe(200);
});

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/,
  );
}
