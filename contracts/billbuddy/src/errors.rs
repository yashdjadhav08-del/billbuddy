use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(u32)]
pub enum ContractError {
    // Household errors (1xx)
    HouseholdNotFound = 100,
    HouseholdAlreadyExists = 101,
    HouseholdInactive = 102,
    PeriodAlreadyClosed = 103,
    OutstandingBalances = 104,

    // Member errors (2xx)
    MemberNotFound = 200,
    MemberAlreadyExists = 201,
    MemberInactive = 202,
    UnauthorizedMutation = 203,
    CannotRemoveOwner = 204,

    // Bill errors (3xx)
    BillNotFound = 300,
    InvalidAmount = 301,
    InvalidSplit = 302,
    SplitMismatch = 303,
    BillAlreadySettled = 304,
    UnauthorizedBillMutation = 305,
    NotBillParticipant = 306,
    BillPaymentTooLarge = 307,
    AlreadyPaidShare = 308,
    CannotDeleteSettledBill = 309,

    // Settlement errors (4xx)
    SettlementNotFound = 400,
    SettlementAlreadyCompleted = 401,
    SettlementAlreadyFailed = 402,
    UnauthorizedSettlement = 403,
    SettlementAmountMismatch = 404,
    DuplicateSettlement = 405,

    // Generic errors (9xx)
    InternalError = 900,
    InvalidInput = 901,
}
