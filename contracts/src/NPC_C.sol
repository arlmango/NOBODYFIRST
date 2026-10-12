// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {NpcBase, NpcRules} from "./NpcBase.sol";
import {NPC_C_ID, OFFER_NONE} from "./Types.sol";

/// @title NPC_C — observer: no offer (NONE only), no transfer may involve C; goal: holds nothing.
contract NPC_C is NpcBase {
    constructor(address items_, address coordinator_)
        NpcBase(
            items_,
            coordinator_,
            NpcRules({
                npcId: NPC_C_ID,
                offerId: OFFER_NONE,
                giveTo: 0,
                giveItem: 0,
                giveQty: 0,
                needFrom: 0,
                needItem: 0,
                needQty: 0,
                goalKey: 0,
                goalCoin: 0
            })
        )
    {}
}
