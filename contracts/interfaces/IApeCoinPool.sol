// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

interface IApeCoinPool {
    struct ApeCoinDepositInfo {
        //deposit for
        address onBehalf;
        //user payment token
        address cashToken;
        //user cash amount
        uint256 cashAmount;
        //isBAYC if Ape is BAYC
        bool isBAYC;
        //Ape token ids
        uint32[] tokenIds;
    }

    struct ApeCoinPairDepositInfo {
        //deposit for
        address onBehalf;
        //user payment token
        address cashToken;
        //user cash amount
        uint256 cashAmount;
        //isBAYC if Ape is BAYC
        bool isBAYC;
        //Ape token ids
        uint32[] apeTokenIds;
        //BAKC token ids
        uint32[] bakcTokenIds;
    }

    struct ApeCoinWithdrawInfo {
        //user receive token
        address cashToken;
        //user receive token amount
        uint256 cashAmount;
        //isBAYC if Ape is BAYC
        bool isBAYC;
        //Ape token ids
        uint32[] tokenIds;
    }

    struct ApeCoinPairWithdrawInfo {
        //user receive token
        address cashToken;
        //user receive token amount
        uint256 cashAmount;
        //isBAYC if Ape is BAYC
        bool isBAYC;
        //Ape token ids
        uint32[] apeTokenIds;
        //BAKC token ids
        uint32[] bakcTokenIds;
    }

    event ApeCoinPoolDeposited(bool isBAYC, uint256 tokenId);
    event ApeCoinPoolCompounded(bool isBAYC, uint256 tokenId);
    event ApeCoinPoolWithdrew(bool isBAYC, uint256 tokenId);
    event ApeCoinPairPoolDeposited(
        bool isBAYC,
        uint256 apeTokenId,
        uint256 bakcTokenId
    );
    event ApeCoinPairPoolCompounded(
        bool isBAYC,
        uint256 apeTokenId,
        uint256 bakcTokenId
    );
    event ApeCoinPairPoolWithdrew(
        bool isBAYC,
        uint256 apeTokenId,
        uint256 bakcTokenId
    );

    /**
     * @notice deposit Ape and ape coin position to Ape coin Pool.
     * @param depositInfo Detail deposit info
     **/
    function depositApeCoinPool(ApeCoinDepositInfo calldata depositInfo)
        external;

    /**
     * @notice claim Ape staking reward from ApeCoinStaking and compound as cApe for user
     * only ape staking bot can call this function
     * @param isBAYC if Ape is BAYC
     * @param tokenIds Ape token ids
     */
    function compoundApeCoinPool(bool isBAYC, uint32[] calldata tokenIds)
        external;

    /**
     * @notice withdraw Ape and ape coin position from Ape coin Pool
     * @param withdrawInfo Detail withdraw info
     */
    function withdrawApeCoinPool(ApeCoinWithdrawInfo calldata withdrawInfo)
        external;

    /**
     * @notice deposit Ape and ape coin position to Ape coin Pool.
     * @param depositInfo Detail deposit info
     **/
    function depositApeCoinPairPool(ApeCoinPairDepositInfo calldata depositInfo)
        external;

    /**
     * @notice claim Ape pair staking reward from ApeCoinStaking and compound as cApe for user
     * only ape staking bot can call this function
     * @param isBAYC if Ape is BAYC
     * @param apeTokenIds Ape token ids
     * @param bakcTokenIds BAKC token ids
     */
    function compoundApeCoinPairPool(
        bool isBAYC,
        uint32[] calldata apeTokenIds,
        uint32[] calldata bakcTokenIds
    ) external;

    /**
     * @notice withdraw Ape, BAKC and ape coin position from Ape coin Pair Pool
     * @param withdrawInfo Detail withdraw info
     */
    function withdrawApeCoinPairPool(
        ApeCoinPairWithdrawInfo calldata withdrawInfo
    ) external;

    /**
     * @notice Callback function for Ape nToken owner change, will auto claim owner's pending reward or ApeCoin pool position
     * @param isBAYC if Ape is BAYC
     * @param tokenIds Ape token ids
     */
    function nApeOwnerChangeCallback(bool isBAYC, uint32[] calldata tokenIds)
        external;

    /**
     * @notice Callback function for BAKC nToken owner change, will auto claim owner's pending reward
     * @param tokenIds BAKC tokenIds
     */
    function nBakcOwnerChangeCallback(uint32[] calldata tokenIds) external;
}
