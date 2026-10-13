import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/server/index.js';
import { dbManager } from '../src/server/db/manager.js';
import { databaseService } from '../src/server/services/database.js';

describe('Pterodactyl Schedules and Task Automation Suite', () => {
  let app: any;
  let testDbId: string;
  let adminCookie: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Setup or login
    const setupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'admin_test',
        password: 'SuperSecretPassword123!',
        confirmPassword: 'SuperSecretPassword123!',
      },
    });

    if (setupRes.statusCode === 201) {
      const session = setupRes.cookies.find((c: any) => c.name === 'vdb_session');
      adminCookie = `vdb_session=${session.value}`;
    } else {
      let loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'admin_test',
          password: 'SuperSecretPassword123!',
        },
      });

      if (loginRes.statusCode !== 200) {
        loginRes = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: {
            username: process.env.VDB_ADMIN_USERNAME || 'VanillaDatabase',
            password: process.env.VDB_ADMIN_PASSWORD || '123456',
          },
        });
      }

      if (loginRes.statusCode !== 200) {
        const { authService } = await import('../src/server/services/auth.js');
        const metaDb = (await import('../src/server/db/metadata.js')).getMetadataDb();
        const existingAdmin = metaDb.prepare("SELECT id FROM users WHERE username = 'admin_test'").get() as any;
        if (!existingAdmin) {
          await authService.createAdminUser('admin_test', 'SuperSecretPassword123!', 'super_admin');
        } else {
          const hash = await authService.hashPassword('SuperSecretPassword123!');
          metaDb.prepare("UPDATE users SET password_hash = ?, totp_enabled = 0 WHERE username = 'admin_test'").run(hash);
        }
        loginRes = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: {
            username: 'admin_test',
            password: 'SuperSecretPassword123!',
          },
        });
      }

      const session = loginRes.cookies.find((c: any) => c.name === 'vdb_session');
      adminCookie = `vdb_session=${session.value}`;
    }

    // Create test database
    const dbRes = await app.inject({
      method: 'POST',
      url: '/api/admin/databases',
      headers: { cookie: adminCookie },
      payload: {
        name: 'Schedules Test DB',
        description: 'Testing Pterodactyl-style schedules and tasks',
      },
    });
    expect(dbRes.statusCode).toBe(201);
    testDbId = dbRes.json().data.id;

    // Create initial table
    dbManager.executeMultiStatements(testDbId, 'CREATE TABLE IF NOT EXISTS test_cron (id INTEGER PRIMARY KEY, note TEXT, created_at INTEGER);');
  }, 30000);

  afterAll(async () => {
    if (testDbId) {
      try {
        databaseService.deleteDatabase(testDbId);
      } catch {
        // cleanup
      }
    }
    dbManager.closeAll();
    if (app) await app.close();
  }, 30000);

  it('should create schedule with Pterodactyl 5-part cron syntax and empty tasks', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${testDbId}/jobs`,
      headers: { cookie: adminCookie },
      payload: {
        name: 'Nightly Maintenance',
        cron_minute: '5',
        cron_hour: '*',
        cron_day_month: '*',
        cron_month: '*',
        cron_day_week: '*',
        only_when_online: true,
        enabled: true,
      },
    });

    expect(res.statusCode).toBe(201);
    const schedule = res.json().data;
    expect(schedule.name).toBe('Nightly Maintenance');
    expect(schedule.cron_minute).toBe('5');
    expect(schedule.cron_hour).toBe('*');
    expect(schedule.cron_expression).toBe('5 * * * *');
    expect(schedule.only_when_online).toBe(true);
    expect(schedule.tasks).toEqual([]);
  });

  it('should add multiple tasks to schedule: SQL command, backup task, and power action', async () => {
    // List to get schedule ID
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/admin/databases/${testDbId}/jobs`,
      headers: { cookie: adminCookie },
    });
    expect(listRes.statusCode).toBe(200);
    const schedule = listRes.json().data[0];
    expect(schedule).toBeDefined();

    // 1. Add SQL Command Task
    const task1Res = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${schedule.id}/tasks`,
      headers: { cookie: adminCookie },
      payload: {
        action: 'send_command',
        payload: "INSERT INTO test_cron (note, created_at) VALUES ('Cron Task Executed', unixepoch());",
        time_offset: 0,
        continue_on_failure: false,
      },
    });
    expect(task1Res.statusCode).toBe(201);
    expect(task1Res.json().data.action).toBe('send_command');

    // 2. Add Backup Task ("và phần backup có hỗ trợ lun")
    const task2Res = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${schedule.id}/tasks`,
      headers: { cookie: adminCookie },
      payload: {
        action: 'create_backup',
        payload: 'Scheduled automatic snapshot',
        time_offset: 0,
        continue_on_failure: true,
      },
    });
    expect(task2Res.statusCode).toBe(201);
    expect(task2Res.json().data.action).toBe('create_backup');

    // 3. Add Maintenance Task (WAL Checkpoint & Optimize)
    const task3Res = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${schedule.id}/tasks`,
      headers: { cookie: adminCookie },
      payload: {
        action: 'run_maintenance',
        payload: 'checkpoint',
        time_offset: 0,
        continue_on_failure: true,
      },
    });
    expect(task3Res.statusCode).toBe(201);
    expect(task3Res.json().data.action).toBe('run_maintenance');

    // 4. Add Webhook Notification Task
    const task4Res = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${schedule.id}/tasks`,
      headers: { cookie: adminCookie },
      payload: {
        action: 'trigger_webhook',
        payload: 'Nightly maintenance sync done',
        time_offset: 0,
        continue_on_failure: true,
      },
    });
    expect(task4Res.statusCode).toBe(201);
    expect(task4Res.json().data.action).toBe('trigger_webhook');

    // Fetch schedule and verify all 4 tasks are present
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/admin/jobs/${schedule.id}`,
      headers: { cookie: adminCookie },
    });
    expect(getRes.statusCode).toBe(200);
    const updatedSchedule = getRes.json().data;
    expect(updatedSchedule.tasks.length).toBe(4);
    expect(updatedSchedule.tasks[0].action).toBe('send_command');
    expect(updatedSchedule.tasks[1].action).toBe('create_backup');
    expect(updatedSchedule.tasks[2].action).toBe('run_maintenance');
    expect(updatedSchedule.tasks[3].action).toBe('trigger_webhook');

    // Trigger run of the entire schedule!
    const runRes = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${schedule.id}/run`,
      headers: { cookie: adminCookie },
    });
    expect(runRes.statusCode).toBe(200);
    expect(runRes.json().success).toBe(true);

    // Verify SQL Command executed: row exists in test_cron
    const checkDb = dbManager.get(testDbId);
    const row = checkDb.prepare('SELECT * FROM test_cron WHERE note = ?').get('Cron Task Executed') as any;
    expect(row).toBeDefined();
    expect(row.note).toBe('Cron Task Executed');

    // Verify Backup Task executed: backup record exists in backups table
    const backupsRes = await app.inject({
      method: 'GET',
      url: `/api/admin/databases/${testDbId}/backups`,
      headers: { cookie: adminCookie },
    });
    expect(backupsRes.statusCode).toBe(200);
    expect(backupsRes.json().data.length).toBeGreaterThanOrEqual(1);

    // Update Task
    const taskIdToUpdate = updatedSchedule.tasks[0].id;
    const updateTaskRes = await app.inject({
      method: 'PATCH',
      url: `/api/admin/jobs/${schedule.id}/tasks/${taskIdToUpdate}`,
      headers: { cookie: adminCookie },
      payload: {
        time_offset: 5,
        continue_on_failure: true,
      },
    });
    expect(updateTaskRes.statusCode).toBe(200);
    expect(updateTaskRes.json().data.time_offset).toBe(5);
    expect(updateTaskRes.json().data.continue_on_failure).toBe(true);

    // Delete Task
    const deleteTaskRes = await app.inject({
      method: 'DELETE',
      url: `/api/admin/jobs/${schedule.id}/tasks/${taskIdToUpdate}`,
      headers: { cookie: adminCookie },
    });
    expect(deleteTaskRes.statusCode).toBe(200);
    expect(deleteTaskRes.json().success).toBe(true);

    // Verify task deleted
    const getAfterDeleteRes = await app.inject({
      method: 'GET',
      url: `/api/admin/jobs/${schedule.id}`,
      headers: { cookie: adminCookie },
    });
    expect(getAfterDeleteRes.json().data.tasks.length).toBe(3);

    // Delete Schedule
    const delSchedRes = await app.inject({
      method: 'DELETE',
      url: `/api/admin/jobs/${schedule.id}`,
      headers: { cookie: adminCookie },
    });
    expect(delSchedRes.statusCode).toBe(200);
    expect(delSchedRes.json().success).toBe(true);
  });

  it('should fetch database activity timeline stream with search and schedule audit records', async () => {
    // 1. Fetch database activity stream
    const actRes = await app.inject({
      method: 'GET',
      url: `/api/admin/databases/${testDbId}/activity`,
      headers: { cookie: adminCookie },
    });
    expect(actRes.statusCode).toBe(200);
    const body = actRes.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);

    // Verify properties of activity items
    const firstItem = body.data.items[0];
    expect(firstItem.id).toBeDefined();
    expect(firstItem.user).toBeDefined();
    expect(firstItem.action).toBeDefined();
    expect(firstItem.description).toBeDefined();
    expect(typeof firstItem.timestamp).toBe('number');

    // 2. Test search filter by username / action
    const searchRes = await app.inject({
      method: 'GET',
      url: `/api/admin/databases/${testDbId}/activity?search=schedule`,
      headers: { cookie: adminCookie },
    });
    expect(searchRes.statusCode).toBe(200);
    const searchBody = searchRes.json();
    expect(searchBody.success).toBe(true);
    expect(searchBody.data.items.every((it: any) =>
      it.action.toLowerCase().includes('schedule') ||
      it.description.toLowerCase().includes('schedule') ||
      it.user.toLowerCase().includes('schedule')
    )).toBe(true);
  });
});
