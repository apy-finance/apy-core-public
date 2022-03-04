// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

/**
 * @notice For pools that can charge an early withdrawal fee
 */
interface IWithdrawFeePoolV2 {
    /**
     * @notice Log when the fee period changes
     * @param feePeriod The new fee period
     */
    event FeePeriodChanged(uint256 feePeriod);

    /**
     * @notice Log when the fee percentage changes
     * @param feePercentage The new percentage
     */
    event FeePercentageChanged(uint256 feePercentage);

    /**
     * @notice Log when the withdrawal fee changes
     * @param withdrawalFee The new withdrawal fee
     */
    event WithdrawalFeeChanged(uint256 withdrawalFee);

    /**
     * @notice Set the new fee period
     * @param feePeriod_ The new fee period
     */
    function setFeePeriod(uint256 feePeriod_) external;

    /**
     * @notice Set the new fee percentage
     * @param feePercentage_ The new percentage
     */
    function setFeePercentage(uint256 feePercentage_) external;

    /**
     * @notice Set the new withdrawal fee
     * @param withdrawalFee_ The new withdrawal fee
     */
    function setWithdrawalFee(uint256 withdrawalFee_) external;

    /**
     * @notice Get the period of time that a withdrawal will be considered early
     * @notice An early withdrawal gets charged a fee
     * @notice The period starts from the time of the last deposit for an account
     * @return The time in seconds
     */
    function feePeriod() external view returns (uint256);

    /**
     * @notice Get the percentage of a withdrawal that is charged as a fee
     * @return The percentage
     */
    function feePercentage() external view returns (uint256);

    /**
     *@notice fee charged for all withdrawals in 1/100th basis points,
     * e.g. 100 = 1 bps
     * @return The withdrawal fee
     */
    function withdrawalFee() external view returns (uint256);

    /**
     * @notice Check if caller will be charged early withdrawal fee
     * @return `true` when fee will apply, `false` when it won't
     */
    function isEarlyRedeem() external view returns (bool);
}
