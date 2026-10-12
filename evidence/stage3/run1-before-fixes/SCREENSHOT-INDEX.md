# Stage 3 screenshots (Local chain mode, full run in logs/e2e-run.log)

| File | Scenario | Viewport | Shows |
|---|---|---|---|
| chain-game-390.png | S1 | 390 | Local chain board, both promises selected, Preview ready (review panel with transfers and before/expected-after table) |
| chain-game-1440.png | S1 | 1440 | Same state at desktop width |
| chain-result-390.png | S1 | 390 | Confirmed result ("Everyone kept their promise."), before/after per person, transaction details |
| chain-result-1440.png | S1 | 1440 | Same result at desktop width; proof panel with chain 31337, contract addresses, startRun/execute receipts and decoded events, final ledger balances |
| chain-reload-restored-390.png | S1b | 390 | Reload with preauthorised wallet: restored result from contracts, no Start run |
| chain-reload-restored-1440.png | S1b | 1440 | Same at desktop width |
| chain-incomplete-A-1440.png | S2 | 1440 | Only A selected: "This exchange would not work" explanation naming B's promise, no Execute deal |
| chain-switch-account3-1440.png | S3 | 1440 | After switching to account 3: no run, Start run offered, no account-1 result |
| chain-switch-preview-1440.png | S3 | 1440 | Account 4 preview, switched to account 5: no send, no Execute |
| chain-switch-midop-1440.png | S3 | 1440 | Best effort: execute pending (automine off), switched account, block mined: invalidated-operation notice |
| chain-wrong-network-1440.png | S4 | 1440 | Wrong network (chain ID 1): Switch network offered, no execute path |
| chain-declined-1440.png | S5 | 1440 | "Request declined. Nothing was sent." |
| chain-rpc-failure-preview-1440.png | S6 | 1440 | Preview with the RPC route aborted: read error text, no success, no demo data |
| chain-rpc-failure-1440.png | S6 | 1440 | Reload with RPC aborted: "Local chain unavailable" with Retry |
| chain-stale-preview-1440.png | S7 | 1440 | "The preview is out of date" after an external execute |
| chain-deployment-missing-1440.png | S8 | 1440 | Anvil stopped, manifest missing: "Local deployment not usable" with the start/deploy command |
| demo-result-1440.png | S10 | 1440 | Demo mode result ("Simulated result. No blockchain transaction was sent."), no chain requests |
