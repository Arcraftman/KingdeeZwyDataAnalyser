#include "finance/voucher_validator.hpp"

#include <functional>
#include <iostream>
#include <stdexcept>
#include <utility>

using namespace finance;

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

VoucherEntry entry(std::string account, int direction, std::string amount = "10") {
    VoucherEntry result;
    result.account_name = std::move(account);
    result.direction = direction;
    result.amount = std::move(amount);
    result.currency = "RMB";
    return result;
}

Voucher voucher(std::vector<VoucherEntry> entries, std::string total = "10") {
    return {"123456789012345678", "2026-08-01", "记-1", std::move(entries), total, total};
}

void rejects(const Voucher& value, ValidationCode code, std::size_t index) {
    try {
        (void)validate_vouchers({value});
    } catch (const ValidationError& error) {
        require(error.code() == code, "wrong error code");
        require(error.voucher_id() == value.id, "wrong voucher ID");
        require(error.entry_index() == index, "wrong entry index");
        return;
    }
    throw std::runtime_error("invalid voucher was accepted");
}

int main() {
    const std::vector<std::pair<const char*, std::function<void()>>> tests = {
        {"cash transfer and long IDs", [] {
            const auto rows = validate_vouchers({voucher({
                entry("100201 银行存款", 1), entry("100202 银行存款", -1)})});
            require(rows.size() == 2, "row count");
            require(rows[0].voucher_id == "123456789012345678", "ID changed");
            require(rows[0].entry_index == 1 && rows[1].entry_index == 2, "index");
            require(rows[0].debit == "10" && rows[0].credit == "0", "debit");
            require(rows[1].debit == "0" && rows[1].credit == "10", "credit");
            for (const auto& row : rows)
                require(row.cash_flow_kind == CashFlowKind::internal_transfer, "classification");
        }},
        {"auxiliary suffix and external flow", [] {
            const auto rows = validate_vouchers({voucher({
                entry("100201 银行存款", 1), entry("112201_004 应收账款_客户", -1)})});
            require(rows[1].account_number == "112201", "suffix");
            for (const auto& row : rows)
                require(row.cash_flow_kind == CashFlowKind::other, "external flow");
        }},
        {"explicit account and metadata", [] {
            auto first = entry("银行存款", 1);
            first.account_number = "001002_01";
            first.auxiliary = "客户甲";
            first.explanation = "=literal text";
            first.foreign_amount = " 1.2300e+1 ";
            const auto rows = validate_vouchers({voucher({first, entry("1122 应收", -1)})});
            require(rows[0].account_number == "001002", "leading zeros");
            require(rows[0].account_name == "银行存款", "name");
            require(rows[0].auxiliary == "客户甲", "auxiliary");
            require(rows[0].explanation == "=literal text", "explanation");
            require(rows[0].currency == "RMB", "currency");
            require(rows[0].foreign_amount == "12.3", "foreign amount");
            require(rows[0].date == "2026-08-01" && rows[0].voucher_number == "记-1", "metadata");
        }},
        {"exact fractional addition", [] {
            const auto rows = validate_vouchers({voucher({
                entry("1001", 1, "0.1"), entry("1001", 1, "0.2"),
                entry("1122", -1, "0.3")}, "0.30")});
            require(rows.size() == 3, "decimal addition");
            rejects(voucher({entry("1001", 1, "0.30000000000000001"),
                             entry("1122", -1, "0.3")}, "0.3"),
                    ValidationCode::unbalanced_entries, 0);
        }},
        {"large amount and carry", [] {
            const std::string total = "1000000000000000000000000000000";
            const auto rows = validate_vouchers({voucher({
                entry("1001", 1, "999999999999999999999999999999.99"),
                entry("1001", 1, ".01"), entry("1122", -1, total)}, total)});
            require(rows[2].credit == total, "large amount changed");
        }},
        {"negative reversal and cancellation", [] {
            const auto rows = validate_vouchers({voucher({
                entry("1001", 1, "-1.25"), entry("1122", -1, "-1.25")}, "-1.25")});
            require(rows[0].debit == "-1.25", "negative reversal");
            (void)validate_vouchers({voucher({
                entry("1001", 1, "1"), entry("1001", 1, "-1"),
                entry("1122", -1, "-0.00")}, "0")});
            (void)validate_vouchers({voucher({
                entry("1001", 1, "-10"), entry("1001", 1, "0.01"),
                entry("1122", -1, "-9.99")}, "-9.99")});
            (void)validate_vouchers({voucher({
                entry("1001", 1, "0.01"), entry("1001", 1, "-10"),
                entry("1122", -1, "-9.99")}, "-9.99")});
        }},
        {"exponent notation and zero", [] {
            const auto rows = validate_vouchers({voucher({
                entry("1001", 1, "+.125e2"), entry("1122", -1, "12.500")}, "125e-1")});
            require(rows[0].debit == "12.5", "exponent");
            const auto zeros = validate_vouchers({voucher({
                entry("1001", 1, "-0.00"), entry("1122", -1, "0e10")}, "0")});
            require(zeros[0].debit == "0", "negative zero");
        }},
        {"optional foreign amount", [] {
            auto first = entry("1001", 1);
            first.foreign_amount = "";
            const auto rows = validate_vouchers({voucher({first, entry("1122", -1)})});
            require(!rows[0].foreign_amount && !rows[1].foreign_amount, "missing foreign amount");
            first.foreign_amount = "NaN";
            rejects(voucher({first, entry("1122", -1)}), ValidationCode::invalid_amount, 1);
        }},
        {"invalid accounts and directions", [] {
            for (const auto& account : {"", "abc", "10-01", "_01", " 1001", "１００１"})
                rejects(voucher({entry(account, 1), entry("1122", -1)}),
                        ValidationCode::invalid_account, 1);
            for (const auto direction : {0, 2, -2})
                rejects(voucher({entry("1001", direction), entry("1122", -1)}),
                        ValidationCode::invalid_direction, 1);
        }},
        {"invalid decimal syntax and limits", [] {
            for (const auto& value : {"", " ", "NaN", "sNaN", "Infinity", "-inf",
                                     ".", "1.2.3", "1e", "1e+", "1_000", "1,000",
                                     "1e257", "1e-257", "1e999999999999999999"})
                rejects(voucher({entry("1001", 1, value), entry("1122", -1)}),
                        ValidationCode::invalid_amount, 1);
            rejects(voucher({entry("1001", 1, std::string(1025, '0')), entry("1122", -1)}),
                    ValidationCode::invalid_amount, 1);
            (void)validate_vouchers({voucher({
                entry("1001", 1, "1e-256"), entry("1122", -1, "1e-256")}, "1e-256")});
        }},
        {"unbalanced and incorrect declared totals", [] {
            rejects(voucher({entry("1001", 1), entry("1122", -1, "9")}),
                    ValidationCode::unbalanced_entries, 0);
            auto value = voucher({entry("1001", 1), entry("1122", -1)});
            value.debit_total = "11";
            rejects(value, ValidationCode::total_mismatch, 0);
            value.debit_total = "10"; value.credit_total = "9";
            rejects(value, ValidationCode::total_mismatch, 0);
            value.credit_total = "NaN";
            rejects(value, ValidationCode::invalid_amount, 0);
        }},
        {"empty inputs match current Python rules", [] {
            require(validate_vouchers({}).empty(), "empty batch");
            require(validate_vouchers({voucher({}, "0")}).empty(), "empty zero voucher");
            rejects(voucher({}, "1"), ValidationCode::total_mismatch, 0);
        }},
        {"batch order and failure context", [] {
            auto first = voucher({entry("1001", 1), entry("1122", -1)});
            auto second = first; second.id = "second";
            const auto rows = validate_vouchers({first, second});
            require(rows.size() == 4 && rows[2].voucher_id == "second" &&
                    rows[2].entry_index == 1, "batch order");
            second.entries[1].direction = 0;
            try { (void)validate_vouchers({first, second}); }
            catch (const ValidationError& error) {
                require(error.voucher_id() == "second" && error.entry_index() == 2, "batch error context");
                return;
            }
            throw std::runtime_error("batch failure was ignored");
        }}
    };
    int failed = 0;
    for (const auto& [name, run] : tests) {
        try { run(); std::cout << "[PASS] " << name << '\n'; }
        catch (const std::exception& error) {
            ++failed;
            std::cerr << "[FAIL] " << name << ": " << error.what() << '\n';
        }
    }
    std::cout << tests.size() - failed << "/" << tests.size() << " cases passed\n";
    return failed == 0 ? 0 : 1;
}
