// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {NpcBase, NpcRules} from "./NpcBase.sol";
import {KEY, COIN, NPC_A_ID, NPC_B_ID, OFFER_A1} from "./Types.sol";

/// @title NPC_A — offer A1: gives B 1 KEY, requires 1 COIN from B; goal: holds only 1 COIN.
contract NPC_A is NpcBase {
    constructor(address items_, address coordinator_)
        NpcBase(
            items_,
            coordinator_,
            NpcRules({
                npcId: NPC_A_ID,
                offerId: OFFER_A1,
                giveTo: NPC_B_ID,
                giveItem: KEY,
                giveQty: 1,
                needFrom: NPC_B_ID,
                needItem: COIN,
                needQty: 1,
                goalKey: 0,
                goalCoin: 1
            })
        )
    {}
}
