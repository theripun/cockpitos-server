import axios from 'axios';
import { randomBytes } from 'crypto';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:9100';
const TOTAL_ACCOUNTS = 20;
const BATCH_SIZE = 20;

interface CreateAccountResult {
    index: number;
    success: boolean;
    userId?: string;
    email?: string;
    username?: string;
    error?: string;
    timeTaken?: number;
}

// Generate unique user data
function generateUniqueUser(index: number) {
    const uniqueId = randomBytes(8).toString('hex');
    const timestamp = Date.now();

    return {
        firstName: `User${index}`,
        lastName: `Test${timestamp}`,
        email: `user${index}_${uniqueId}@stress-test.local`,
        username: `user${index}_${uniqueId}`,
        password: `${randomBytes(16).toString('base64')}@Pass${index}!`,
        marketingOptIn: Math.random() > 0.5,
    };
}

// Create a single account (signup/start + signup/password)
async function createAccount(userData: ReturnType<typeof generateUniqueUser>, index: number): Promise<CreateAccountResult> {
    const startTime = Date.now();

    try {
        // Step 1: Start signup
        const signupResponse = await axios.post(`${API_BASE_URL}/auth/signup/start`, {
            firstName: userData.firstName,
            lastName: userData.lastName,
            email: userData.email,
            username: userData.username,
            marketingOptIn: userData.marketingOptIn,
        });

        const userId = signupResponse.data.userId;

        if (!userId) {
            throw new Error('No userId returned from signup/start');
        }

        // Step 2: Set password
        await axios.post(`${API_BASE_URL}/auth/signup/password`, {
            userId: userId,
            password: userData.password,
        });

        const timeTaken = Date.now() - startTime;

        return {
            index,
            success: true,
            userId,
            email: userData.email,
            username: userData.username,
            timeTaken,
        };
    } catch (error: any) {
        const timeTaken = Date.now() - startTime;
        return {
            index,
            success: false,
            error: error.response?.data?.message || error.message,
            timeTaken,
        };
    }
}

// Process accounts in batches
async function processBatch(startIndex: number, batchSize: number): Promise<CreateAccountResult[]> {
    const promises = [];

    for (let i = 0; i < batchSize; i++) {
        const index = startIndex + i;
        const userData = generateUniqueUser(index);
        promises.push(createAccount(userData, index));
    }

    return Promise.all(promises);
}

async function main() {
    console.log(`🚀 Starting stress test: Creating ${TOTAL_ACCOUNTS} accounts...`);
    console.log(`📦 Batch size: ${BATCH_SIZE}`);
    console.log(`🌐 API URL: ${API_BASE_URL}`);
    console.log('');

    const overallStartTime = Date.now();
    const results: CreateAccountResult[] = [];

    // Process in batches
    const totalBatches = Math.ceil(TOTAL_ACCOUNTS / BATCH_SIZE);

    for (let batch = 0; batch < totalBatches; batch++) {
        const startIndex = batch * BATCH_SIZE;
        const currentBatchSize = Math.min(BATCH_SIZE, TOTAL_ACCOUNTS - startIndex);

        console.log(`\n📊 Processing batch ${batch + 1}/${totalBatches} (accounts ${startIndex + 1}-${startIndex + currentBatchSize})...`);

        const batchStartTime = Date.now();
        const batchResults = await processBatch(startIndex, currentBatchSize);
        const batchTimeTaken = Date.now() - batchStartTime;

        results.push(...batchResults);

        const batchSuccessCount = batchResults.filter(r => r.success).length;
        const batchFailCount = batchResults.length - batchSuccessCount;

        console.log(`   ✅ Success: ${batchSuccessCount}/${currentBatchSize}`);
        console.log(`   ❌ Failed: ${batchFailCount}/${currentBatchSize}`);
        console.log(`   ⏱️  Time: ${batchTimeTaken}ms (${(batchTimeTaken / currentBatchSize).toFixed(2)}ms per account)`);
    }

    const overallTimeTaken = Date.now() - overallStartTime;

    // Calculate statistics
    const successfulAccounts = results.filter(r => r.success);
    const failedAccounts = results.filter(r => !r.success);

    const successTimes = successfulAccounts.map(r => r.timeTaken || 0);
    const avgTime = successTimes.length > 0
        ? successTimes.reduce((a, b) => a + b, 0) / successTimes.length
        : 0;
    const minTime = successTimes.length > 0 ? Math.min(...successTimes) : 0;
    const maxTime = successTimes.length > 0 ? Math.max(...successTimes) : 0;

    console.log('\n' + '='.repeat(60));
    console.log('📈 STRESS TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`✅ Successful: ${successfulAccounts.length}/${TOTAL_ACCOUNTS}`);
    console.log(`❌ Failed: ${failedAccounts.length}/${TOTAL_ACCOUNTS}`);
    console.log(`📊 Success Rate: ${((successfulAccounts.length / TOTAL_ACCOUNTS) * 100).toFixed(2)}%`);
    console.log('');
    console.log('⏱️  PERFORMANCE METRICS:');
    console.log(`   Total Time: ${(overallTimeTaken / 1000).toFixed(2)}s`);
    console.log(`   Throughput: ${(TOTAL_ACCOUNTS / (overallTimeTaken / 1000)).toFixed(2)} accounts/sec`);
    console.log(`   Avg Time per Account: ${avgTime.toFixed(2)}ms`);
    console.log(`   Min Time: ${minTime.toFixed(2)}ms`);
    console.log(`   Max Time: ${maxTime.toFixed(2)}ms`);
    console.log('');

    // Show sample of failures if any
    if (failedAccounts.length > 0) {
        console.log('❌ SAMPLE FAILURES (first 10):');
        failedAccounts.slice(0, 10).forEach(failure => {
            console.log(`   Account ${failure.index}: ${failure.error}`);
        });
        console.log('');
    }

    // Show sample of successful accounts
    if (successfulAccounts.length > 0) {
        console.log('✅ SAMPLE SUCCESSFUL ACCOUNTS (first 5):');
        successfulAccounts.slice(0, 5).forEach(account => {
            console.log(`   ${account.index}: ${account.email} (${account.timeTaken}ms)`);
        });
        console.log('');
    }

    console.log('='.repeat(60));
    console.log('🎉 Stress test completed!');
    console.log('='.repeat(60));

    // Exit with error code if there were failures
    if (failedAccounts.length > 0) {
        process.exit(1);
    }
}

main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});
