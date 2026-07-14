# Stress Test - Create 2000 User Accounts

## Overview
This script creates **2000 unique user accounts** to stress test the authentication system's ability to handle high-volume concurrent registrations.

## What It Does
1. Generates 2000 unique users with:
   - Unique emails (format: `user{index}_{random}@stress-test.local`)
   - Unique usernames (format: `user{index}_{random}`)
   - Unique passwords (cryptographically random + index)
   
2. For each user, performs:
   - `POST /auth/signup/start` → Creates user account
   - `POST /auth/signup/password` → Sets password

3. Processes accounts in **batches of 100** for better visibility and control

## Run the Test

```bash
pnpm run stress-test
```

## Expected Output
- Real-time progress for each batch
- Success/failure count per batch
- Overall statistics including:
  - Total success rate
  - Throughput (accounts/second)
  - Average, min, max response times
  - Sample failures (if any)
  - Sample successful accounts

## Performance Expectations
With a healthy system, you should see:
- ✅ 100% success rate
- ⚡ 10-50 accounts/second (depending on hardware)
- 📊 Consistent response times across batches

## Prerequisites
- Server must be running: `pnpm run dev`
- Database must be accessible
- Port 9100 must be available

## Cleanup
To clean all test data from the database:
```bash
pnpm run db:clean
```

## Troubleshooting
- **Too many connections**: Reduce `BATCH_SIZE` in the script
- **Timeout errors**: Server may need performance tuning
- **Duplicate errors**: Check database constraints
