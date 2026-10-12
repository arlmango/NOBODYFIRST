// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {NpcBase, NpcRules} from "./NpcBase.sol";
import {KEY, COIN, NPC_A_ID, NPC_B_ID, OFFER_B1} from "./Types.sol";

/// @title NPC_B — offer B1: gives A 1 COIN, requires 1 KEY from A; goal: holds only 1 KEY.
contract NPC_B is NpcBase {
    constructor(address items_, address coordinator_)
        NpcBase(
            items_,
            coordinator_,
            NpcRules({
                npcId: NPC_B_ID,
                offerId: OFFER_B1,
                giveTo: NPC_A_ID,
                giveItem: COIN,
                giveQty: 1,
                needFrom: NPC_A_ID,
                needItem: KEY,
                needQty: 1,
                goalKey: 1,
                goalCoin: 0
            })
        )
    {}
}
