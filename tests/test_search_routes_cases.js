'use strict';

const busController = require('../controllers/busController');

// Mock req / res helper
function createMockReqRes(bodyData) {
  const req = {
    body: bodyData,
    query: {},
  };
  let resData = null;
  let statusCode = 200;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      resData = data;
      return this;
    },
  };
  return { req, res, getResult: () => ({ status: statusCode, data: resData }) };
}

async function runTests() {
  console.log('====================================================');
  console.log(' RUNNING SHUTTLE ROUTE SEARCH API TEST SUITE (10 CASES)');
  console.log('====================================================\n');

  try {
    // TEST 1: Garia -> Bidhannagar, passengers = 2
    console.log('--- TEST 1: Garia -> Bidhannagar (passengers = 2) ---');
    const t1 = createMockReqRes({
      pickup: "Garia, Kolkata",
      dropoff: "Bidhannagar, Kolkata",
      pickup_latitude: 22.4600,
      pickup_longitude: 88.3800,
      dropoff_latitude: 22.5700,
      dropoff_longitude: 88.4000,
      date: "2026-10-05",
      passengers: 2
    });
    await busController.searchRoutes(t1.req, t1.res, (err) => { if (err) console.error(err); });
    const r1 = t1.getResult();
    console.log('STATUS:', r1.status);
    console.log('SEARCH PASSENGERS:', r1.data?.search?.passengers);
    console.log('TOTAL TIMINGS:', r1.data?.summary?.total_timings);
    console.log('TOP PICK:', r1.data?.top_pick ? `${r1.data.top_pick.pickup_stop.name} -> ${r1.data.top_pick.drop_stop.name} (${r1.data.top_pick.pickup_time} -> ${r1.data.top_pick.drop_time}, Fare: ${r1.data.top_pick.fare.display})` : 'NONE');
    console.log('PASS TEST 1:', r1.status === 200 && r1.data?.search?.passengers === 2);
    console.log('\n');

    // TEST 2: Garia -> Bidhannagar, passengers = 1
    console.log('--- TEST 2: Garia -> Bidhannagar (passengers = 1) ---');
    const t2 = createMockReqRes({
      pickup: "Garia, Kolkata",
      dropoff: "Bidhannagar, Kolkata",
      pickup_latitude: 22.4600,
      pickup_longitude: 88.3800,
      dropoff_latitude: 22.5700,
      dropoff_longitude: 88.4000,
      date: "2026-10-05",
      passengers: 1
    });
    await busController.searchRoutes(t2.req, t2.res, (err) => { if (err) console.error(err); });
    const r2 = t2.getResult();
    console.log('PASS TEST 2:', r2.status === 200 && r2.data?.search?.passengers === 1);
    console.log('\n');

    // TEST 3: Garia -> very distant destination (e.g. 27.000, 85.027 in Nepal)
    console.log('--- TEST 3: Garia -> Far Destination (outside 5km radius) ---');
    const t3 = createMockReqRes({
      pickup: "Garia, Kolkata",
      dropoff: "Far City",
      pickup_latitude: 22.4600,
      pickup_longitude: 88.3800,
      dropoff_latitude: 27.0006,
      dropoff_longitude: 85.0274,
      date: "2026-10-05",
      passengers: 1
    });
    await busController.searchRoutes(t3.req, t3.res, (err) => { if (err) console.error(err); });
    const r3 = t3.getResult();
    console.log('TOTAL TIMINGS:', r3.data?.summary?.total_timings);
    console.log('PASS TEST 3 (empty results for far dropoff):', r3.data?.summary?.total_timings === 0 && r3.data?.top_pick === null);
    console.log('\n');

    // TEST 4: Reversed sequence search (Dakshineswar -> Garia on Route 5 where Garia is seq 1, Dakshineswar is seq 7)
    console.log('--- TEST 4: Invalid sequence (pickup_sequence > drop_sequence) ---');
    const t4 = createMockReqRes({
      pickup: "Dakshineswar",
      dropoff: "Garia",
      pickup_latitude: 22.6557,
      pickup_longitude: 88.3606,
      dropoff_latitude: 22.4656,
      dropoff_longitude: 88.4055,
      date: "2026-10-05",
      passengers: 1
    });
    await busController.searchRoutes(t4.req, t4.res, (err) => { if (err) console.error(err); });
    const r4 = t4.getResult();
    console.log('TOTAL TIMINGS:', r4.data?.summary?.total_timings);
    console.log('PASS TEST 4 (reversed sequence rejected):', r4.data?.summary?.total_timings === 0);
    console.log('\n');

    // TEST 5: Today's past departure filter
    console.log('--- TEST 5: Today\'s past departure filter ---');
    const todayStr = new Date().toISOString().split('T')[0];
    const t5 = createMockReqRes({
      pickup: "Garia, Kolkata",
      dropoff: "Bidhannagar, Kolkata",
      pickup_latitude: 22.4600,
      pickup_longitude: 88.3800,
      dropoff_latitude: 22.5700,
      dropoff_longitude: 88.4000,
      date: todayStr,
      passengers: 1
    });
    await busController.searchRoutes(t5.req, t5.res, (err) => { if (err) console.error(err); });
    const r5 = t5.getResult();
    console.log('TODAY TOTAL VALID TIMINGS:', r5.data?.summary?.total_timings);
    console.log('PASS TEST 5:', r5.status === 200);
    console.log('\n');

    // TEST 6: Future date search
    console.log('--- TEST 6: Future date search ---');
    const t6 = createMockReqRes({
      pickup: "Garia, Kolkata",
      dropoff: "Bidhannagar, Kolkata",
      pickup_latitude: 22.4600,
      pickup_longitude: 88.3800,
      dropoff_latitude: 22.5700,
      dropoff_longitude: 88.4000,
      date: "2026-10-15",
      passengers: 1
    });
    await busController.searchRoutes(t6.req, t6.res, (err) => { if (err) console.error(err); });
    const r6 = t6.getResult();
    console.log('FUTURE DATE TOTAL TIMINGS:', r6.data?.summary?.total_timings);
    console.log('PASS TEST 6:', r6.status === 200);
    console.log('\n');

    // TEST 7: Passengers exceeding capacity (passengers = 999)
    console.log('--- TEST 7: Excessive passengers (passengers = 999) ---');
    const t7 = createMockReqRes({
      pickup: "Garia, Kolkata",
      dropoff: "Bidhannagar, Kolkata",
      pickup_latitude: 22.4600,
      pickup_longitude: 88.3800,
      dropoff_latitude: 22.5700,
      dropoff_longitude: 88.4000,
      date: "2026-10-05",
      passengers: 999
    });
    await busController.searchRoutes(t7.req, t7.res, (err) => { if (err) console.error(err); });
    const r7 = t7.getResult();
    console.log('TOTAL TIMINGS FOR 999 PASSENGERS:', r7.data?.summary?.total_timings);
    console.log('PASS TEST 7 (excluded due to seat limit):', r7.data?.summary?.total_timings === 0);
    console.log('\n');

    // TEST 8: Invalid coordinates / No matching route
    console.log('--- TEST 8: Invalid coordinates validation ---');
    const t8 = createMockReqRes({
      pickup: "Invalid",
      dropoff: "Invalid",
      pickup_latitude: 199.0, // Invalid lat > 90
      pickup_longitude: 88.3800,
      dropoff_latitude: 22.5700,
      dropoff_longitude: 88.4000,
      date: "2026-10-05",
      passengers: 1
    });
    await busController.searchRoutes(t8.req, t8.res, (err) => { if (err) console.error(err); });
    const r8 = t8.getResult();
    console.log('HTTP STATUS:', r8.status);
    console.log('ERROR MESSAGE:', r8.data?.message);
    console.log('PASS TEST 8 (422 validation response):', r8.status === 422);
    console.log('\n');

    // TEST 9: Pickup groups grouping
    console.log('--- TEST 9: Pickup groups grouping ---');
    const t9 = createMockReqRes({
      pickup: "Garia, Kolkata",
      dropoff: "Bidhannagar, Kolkata",
      pickup_latitude: 22.4600,
      pickup_longitude: 88.3800,
      dropoff_latitude: 22.5700,
      dropoff_longitude: 88.4000,
      date: "2026-10-05",
      passengers: 1
    });
    await busController.searchRoutes(t9.req, t9.res, (err) => { if (err) console.error(err); });
    const r9 = t9.getResult();
    console.log('TOTAL PICKUP GROUPS:', r9.data?.summary?.total_pickup_groups);
    console.log('GROUPS ARRAY:', r9.data?.pickup_groups?.map(g => ({ name: g.pickup_stop.name, timings_count: g.timings_count })));
    console.log('PASS TEST 9:', Array.isArray(r9.data?.pickup_groups));
    console.log('\n');

    // TEST 10: Schedules API integration (/api2/bus/schedules)
    console.log('--- TEST 10: /api2/bus/schedules integration ---');
    const t10 = createMockReqRes({
      route_id: 5,
      pickup_stop_id: 18,
      drop_stop_id: 21,
      date: "2026-10-05",
      passengers: 2
    });
    await busController.getSchedules(t10.req, t10.res, (err) => { if (err) console.error(err); });
    const r10 = t10.getResult();
    console.log('SCHEDULES STATUS:', r10.data?.status);
    console.log('SCHEDULES COUNT:', r10.data?.total);
    console.log('FIRST SCHEDULE:', r10.data?.schedules?.[0] ? `ID: ${r10.data.schedules[0].schedule_id}, Fare: ${r10.data.schedules[0].fare.display}, Pickup: ${r10.data.schedules[0].pickup_time}, Drop: ${r10.data.schedules[0].drop_time}` : 'NONE');
    console.log('PASS TEST 10:', r10.data?.status === true && r10.data?.search?.passengers === 2);
    console.log('\n');

    console.log('====================================================');
    console.log(' ALL 10 TEST CASES EXECUTED');
    console.log('====================================================');
  } catch (error) {
    console.error('Test suite error:', error);
  } finally {
    process.exit(0);
  }
}

runTests();
