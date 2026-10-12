# Stage 3 · Local chain · state before / after (S1)

Account (player): `0x70997970c51812dc3a010c7d01b50e0d17dc79c8` · runId: `642829559307850963015472508762062935916233390536` · chain 31337 · coordinator `0x603e1bd79259ebcbaaed0c83eec09ca0b89a5bcc` · items `0xa16e02e87b7454126e5e10d957a927a7f5b5d2be`

Balances are read with `cast call items 'snapshotBalances(uint256)(uint256[6])'` (raw: `[A.KEY, A.COIN, B.KEY, B.COIN, C.KEY, C.COIN]`).

| Item | Before | After |
|---|---|---|
| raw | `[1, 0, 0, 1, 0, 0]` | `[0, 1, 1, 0, 0, 0]` |

| Person | Before | After (ledger) |
|---|---|---|
| A | 1 key | 1 coin |
| B | 1 coin | 1 key |
| C | empty | empty |

Run state (`coordinator.runOf`): before start `0x0000000000000000000000000000000000000000` (no run); after startRun owner `0x70997970c51812dc3a010c7d01b50e0d17dc79c8`, active `true`, solved `false`; after execute owner `0x70997970c51812dc3a010c7d01b50e0d17dc79c8`, active `false`, solved `true`, nonce `1`.

Transactions: startRun `0x2eddaee3e11a0b860840f5b65d978b1728294e2fd07a3f8a34c4bc8bb32d934b` (block 2, status 0x1, events RunStarted, InitialGranted); execute `0xa861add05db6c085f4764c0d1082451b430fe30e6997a5255bcf293778b6c701` (block 3, status 0x1, events PermitIssued, PermitIssued, PermitConsumed, ItemMoved, PermitConsumed, ItemMoved, LevelSolved).
