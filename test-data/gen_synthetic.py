"""Seeded synthetic Bitget UTA v3 export for stress-testing TradeMirror.
Patterns baked in: weekend spread cluster, post-loss tilt streak, premature winners.
Deterministic (seed=7). Run: python3 test-data/gen_synthetic.py"""
import csv, random
random.seed(7)
SYMS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'rNVDAUSDT', 'rTSLAUSDT', 'rAAPLUSDT']
BASE = 1754000000000  # ~Aug 2026 (ms)
rows = []
oid = 0
def add(day, hour, sym, side, price, size, pnl, hold, reason):
    global oid
    oid += 1
    ts = BASE + day * 86400000 + hour * 3600000 + random.randint(0, 3000000)
    rows.append([f'TM-SYN-{oid:04d}', sym, side, 'market', f'{price:.2f}', f'{size:.4f}',
                  f'{price*size:.2f}', f'{pnl:.2f}', f'{price*size*0.0005:.2f}', ts, hold, reason])
# 1) weekday baseline: mild negative edge, mixed
for i in range(38):
    s = random.choice(SYMS); px = random.uniform(20, 90000)
    win = random.random() < 0.42
    add(random.randint(0, 30), random.randint(8, 20), s, random.choice(['BUY','SELL']),
        px, random.uniform(0.01, 2), random.uniform(15, 180) if win else -random.uniform(20, 220),
        random.randint(600, 20000), 'TAKE_PROFIT' if win else 'STOP_LOSS')
# 2) weekend spread trap: Sat/Sun (day%7 in {5,6} approx), outsized losses
for i in range(12):
    s = random.choice(['rNVDAUSDT', 'rTSLAUSDT', 'rAAPLUSDT', 'ETHUSDT']); px = random.uniform(20, 90000)
    add(random.choice([5, 6, 12, 13, 19, 20, 26, 27]), random.choice([2, 4, 8, 22]),
        s, random.choice(['BUY','SELL']), px, random.uniform(0.05, 1.5),
        -random.uniform(60, 320), random.randint(300, 4000), 'STOP_LOSS')
# 3) tilt streak: 5 rapid escalating trades right after day-15 14:00 "blowup"
add(15, 14, 'ETHUSDT', 'BUY', 3840.0, 2.0, -410.55, 1800, 'LIQUIDATION')
sz = 0.4
for i in range(5):
    sz *= 1.8
    add(15, 15, 'ETHUSDT', random.choice(['BUY','SELL']), 3840.0 + random.uniform(-40, 40),
        sz, -random.uniform(40, 200), random.randint(120, 900), 'STOP_LOSS')
# 4) premature winners: quick tiny wins that should flag disposition asymmetry
for i in range(8):
    s = random.choice(SYMS); px = random.uniform(20, 90000)
    add(random.randint(0, 30), random.randint(9, 21), s, 'BUY', px,
        random.uniform(0.1, 1), random.uniform(8, 45), random.randint(60, 400), 'TAKE_PROFIT')
with open('test-data/synthetic-uta-v3.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['orderId','symbol','side','orderType','fillPrice','size','notionalUsd','realizedPnl','fee','timestamp','holdDurationSeconds','closeReason'])
    w.writerows(sorted(rows, key=lambda r: r[9]))
print(f'wrote {len(rows)} rows')
