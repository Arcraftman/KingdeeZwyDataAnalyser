#pragma once

#include <cstddef>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

namespace kdzwy::validator {

struct VoucherEntry {
    std::string account_number; // Empty: extract the code from account_name.
    std::string account_name;
    int direction = 0; // 1 = debit; -1 = credit.
    std::string amount; // Exact decimal text, never a binary float.
    std::string auxiliary;
    std::string explanation;
    std::string currency;
    std::optional<std::string> foreign_amount;
};

struct Voucher {
    std::string id;
    std::string date;
    std::string number;
    std::vector<VoucherEntry> entries;
    std::string debit_total;
    std::string credit_total;
};

enum class CashFlowKind { internal_transfer, other };
enum class ValidationCode {
    invalid_account,
    invalid_direction,
    invalid_amount,
    unbalanced_entries,
    total_mismatch
};

class ValidationError : public std::runtime_error {
public:
    ValidationError(ValidationCode code, std::string voucher_id,
                    std::size_t entry_index, const std::string& message);
    ValidationCode code() const noexcept { return code_; }
    const std::string& voucher_id() const noexcept { return voucher_id_; }
    std::size_t entry_index() const noexcept { return entry_index_; } // 1-based; 0 = voucher.
private:
    ValidationCode code_;
    std::string voucher_id_;
    std::size_t entry_index_;
};

struct ValidatedEntry {
    std::string voucher_id;
    std::size_t entry_index;
    std::string date;
    std::string voucher_number;
    std::string account_number;
    std::string account_name;
    std::string auxiliary;
    std::string explanation;
    std::string debit; // Canonical exact decimal text.
    std::string credit;
    std::string currency;
    std::optional<std::string> foreign_amount;
    CashFlowKind cash_flow_kind;
};

// Preserves input order. Throws ValidationError on the first invalid voucher;
// no partial result is returned. Empty input is valid.
std::vector<ValidatedEntry> validate_vouchers(const std::vector<Voucher>& vouchers);

} // namespace finance
