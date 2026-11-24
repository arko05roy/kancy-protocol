// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

enum ManagerStatus {
    None,
    SelfOnly,
    Active,
    Grace,
    Paused
}

interface IOracleAdapter {
    /// @return USDC (6d) per 1 WETH (1e18).
    function price() external view returns (uint256);
    function checkPool(uint160 sqrtPriceX96) external view;
    function swapLimits(uint256 p) external view returns (uint160 minSqrt, uint160 maxSqrt);
    function wethIsCurrency0() external view returns (bool);
}

interface IManagerRegistry {
    function status(address m) external view returns (ManagerStatus);
    function stake(address m) external view returns (uint256);
    function allocation(address m, address vault) external view returns (uint256);
    function totalAllocation(address m) external view returns (uint256);
    function vaultsOf(address m) external view returns (address[] memory);
    function managers() external view returns (address[] memory);
    function ticks(address m) external view returns (int24 lower, int24 upper);
    function stakeWithdrawRequest(address m) external view returns (uint256);
    function minStake() external view returns (uint256);
    // settler
    function takePendingStake(address m) external returns (uint256);
    function setStake(address m, uint256 s) external;
    function setStatus(address m, ManagerStatus s) external;
    function setAllocation(address m, address vault, uint256 a) external;
    function clearStakeWithdrawRequest(address m) external;
    // book
    function onRebalance(address m, int24 lower, int24 upper) external;
}

interface IPositionBook {
    function closePosition(address m) external;
    function openPosition(address m) external;
    function value(address m, uint256 p) external view returns (uint256);
    function credit(address m, uint256 usdcAmount) external;
    function payout(address m, uint256 amount, address to, uint256 p) external returns (uint256 paid);
    function sweep(address m, address to) external;
    function poolSqrtPrice() external view returns (uint160);
}

interface IKancyVault {
    function curator() external view returns (address);
    function curatorCutBps() external view returns (uint256);
    function minRatioBps() external view returns (uint256);
    function settle() external returns (address[] memory mgrs, uint256[] memory targets);
    function pushToBook(uint256 amount) external;
}

interface IEpochSettler {
    function currentEpoch() external view returns (uint64);
}

interface IVaultFactory {
    function allVaults() external view returns (address[] memory);
    function isVault(address v) external view returns (bool);
}
