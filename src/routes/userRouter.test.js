const request = require("supertest");
const app = require("../service");
const { Role, DB } = require("../database/database.js");

const testUser = { name: "pizza diner", email: "reg@test.com", password: "a" };
let testUserAuthToken;
let testUserId;
let adminUserAuthToken;

async function createAdminUser() {
  const admin = { name: randomName(), password: "toomanysecrets", roles: [{ role: Role.Admin }] };
  admin.email = admin.name + "@admin.com";
  return DB.addUser(admin);
}

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + "@test.com";
  const registerRes = await request(app).post("/api/auth").send(testUser);
  testUserAuthToken = registerRes.body.token;
  testUserId = registerRes.body.user.id;
  expectValidJwt(testUserAuthToken);

  const admin = await createAdminUser();
  const adminLoginRes = await request(app)
    .put("/api/auth")
    .send({ email: admin.email, password: "toomanysecrets" });
  adminUserAuthToken = adminLoginRes.body.token;
});

test("update user", async () => {
  const body = { name: "pizza diner 2", email: testUser.email, password: "a" };
  const putRes = await request(app)
    .put(`/api/user/${testUserId}`)
    .set("Authorization", `Bearer ${testUserAuthToken}`)
    .send(body);

  expect(putRes.status).toBe(200);
});

test("list users unauthorized", async () => {
  const listUsersRes = await request(app).get("/api/user");
  expect(listUsersRes.status).toBe(401);
});

test("list users", async () => {
  const [, userToken] = await registerUser(request(app));
  const listUsersRes = await request(app)
    .get("/api/user")
    .set("Authorization", "Bearer " + userToken);
  expect(listUsersRes.status).toBe(200);
});

test("list users with name filter", async () => {
  const sharedName = "pagination test " + Date.now();
  await request(app).post("/api/auth").send({ name: sharedName, email: `${randomName()}@test.com`, password: "a" });
  await request(app).post("/api/auth").send({ name: sharedName, email: `${randomName()}@test.com`, password: "a" });
  await request(app).post("/api/auth").send({ name: sharedName, email: `${randomName()}@test.com`, password: "a" });

  const listUsersRes = await request(app)
    .get(`/api/user?name=${sharedName}`)
    .set("Authorization", `Bearer ${adminUserAuthToken}`);

  expect(listUsersRes.status).toBe(200);
  expect(listUsersRes.body.users).toHaveLength(3);
  expect(listUsersRes.body.users).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: sharedName })]),
  );
});

test("delete user", async () => {
  const [user, userToken] = await registerUser(request(app));
  const deleteUserRes = await request(app)
    .delete(`/api/user/${user.id}`)
    .set("Authorization", "Bearer " + userToken);
  expect(deleteUserRes.status).toBe(200);
});

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/,
  );
}

async function registerUser(service) {
  const testUser = {
    name: "pizza diner",
    email: `${randomName()}@test.com`,
    password: "a",
  };
  const registerRes = await service.post("/api/auth").send(testUser);
  registerRes.body.user.password = testUser.password;

  return [registerRes.body.user, registerRes.body.token];
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}
