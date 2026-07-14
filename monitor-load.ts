import os from 'os';

function getCpuStats() {
    const cpus = os.cpus();
    let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
    for (const cpu of cpus) {
        user += cpu.times.user;
        nice += cpu.times.nice;
        sys += cpu.times.sys;
        idle += cpu.times.idle;
        irq += cpu.times.irq;
    }
    const total = user + nice + sys + idle + irq;
    return { idle, total };
}

let startStats = getCpuStats();

console.clear();
console.log('🚀 SYSTEM LOAD MONITOR (Updates every 500ms)');
console.log('=============================================');

setInterval(() => {
    const endStats = getCpuStats();
    const idleDiff = endStats.idle - startStats.idle;
    const totalDiff = endStats.total - startStats.total;

    const usage = 100 - Math.floor((100 * idleDiff) / totalDiff);
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = ((usedMem / totalMem) * 100).toFixed(1);

    // Visual Progress Bar
    const barWidth = 40;
    const filledWidth = Math.floor((usage / 100) * barWidth);
    const bar = '█'.repeat(filledWidth) + '░'.repeat(Math.max(0, barWidth - filledWidth));

    process.stdout.write(`\rCPU: [${bar}] ${usage}% | MEM: ${memPercent}% (${(usedMem / (1024 ** 3)).toFixed(2)}GB / ${(totalMem / (1024 ** 3)).toFixed(2)}GB)   `);

    startStats = endStats;
}, 500);
