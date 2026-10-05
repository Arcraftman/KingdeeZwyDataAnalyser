# voucher-validator — 凭证校验模块

C++20 静态库，仅依赖标准库。负责凭证分录校验与规范化，可通过目标
`finance::voucher_validator` 被其他 C++ 模块引用。目前尚未绑定 Python 或接入桌面刷新。

## 目录

- `include/finance/voucher_validator.hpp`：公开输入、输出与错误类型。
- `src/voucher_validator.cpp`：金额处理、分录校验和分类。
- `tests/voucher_validator_test.cpp`：可在 Debug 和 Release 下执行的行为测试。

## 输入与输出

调用 `finance::validate_vouchers(std::vector<Voucher>)`，返回按原始顺序排列的
`std::vector<ValidatedEntry>`。所有金额用十进制字符串传入，输出规范化字符串；
凭证 ID、科目编码也始终使用字符串。Python 适配层应传递原始金额文本，
不能先转为浮点数再送入本模块。

每张凭证检查：

1. 优先使用 account_number；为空时从 account_name 的第一个空格前取编码，
   并去掉第一个下划线及后缀。编码须为非空 ASCII 数字。
2. direction 只能为 1（借）或 -1（贷）。
3. 分录金额、原币金额与声明合计必须是有效的有限十进制数。
4. 借方合计须精确等于贷方合计，并分别等于凭证声明合计。
5. 全部分录科目均以 1001 或 1002 开头时，标记 internal_transfer；
   否则标记 other。此分类沿用现有 Python 规则，不代表银行对账结果。

负数金额用于红字分录，允许保留。原币金额未提供或为空字符串时输出 nullopt。
允许空批次和合计为零的空凭证，沿用当前 Python 行为。日期、摘要、辅助项目和币种
透传；本模块不核实其业务真实性，不负责账套身份、分页或期间校验。

## 金额契约

内部采用十进制数字串进行精确加减，无二进制浮点转换，无自动舍入。
支持正负号、小数点、科学计数法及首尾 ASCII 空格、制表符、回车、换行。
输出去掉多余前导零、小数尾零和负零。

单个输入最长 1024 字节，尾数最多 256 位数字，指数绝对值不超过 256，
展开后的规范化有效数字和小数位数最多 256 位。超过限制明确报错；
累加过程不会因机器整数范围溢出。禁止 NaN、Infinity、千分位、下划线及 Unicode 数字。
这些语法和长度限制比 Python Decimal 更严格；生产接入前应验证真实数据契约。

## 错误契约

失败抛出 ValidationError，不返回部分结果。包含：

- code()：invalid_account、invalid_direction、invalid_amount、
  unbalanced_entries 或 total_mismatch。
- voucher_id()：发生错误的凭证 ID。
- entry_index()：从 1 开始的分录序号；0 表示凭证整体或声明合计错误。
- what()：诊断说明，金额错误会注明对应字段。

## 构建与测试

从仓库根目录，在可用的 Visual Studio 开发环境中运行：

```powershell
cmake -S cpp -B cpp/build
cmake --build cpp/build --config Release
ctest --test-dir cpp/build -C Release --output-on-failure
```

也可独立配置本模块：

```powershell
cmake -S cpp/modules/voucher-validator -B cpp/build/voucher-validator
cmake --build cpp/build/voucher-validator --config Release
ctest --test-dir cpp/build/voucher-validator -C Release --output-on-failure
```

使用示例：

```cpp
#include <finance/voucher_validator.hpp>

finance::VoucherEntry debit;
debit.account_number = "1002";
debit.account_name = "银行存款";
debit.direction = 1;
debit.amount = "0.30";

finance::VoucherEntry credit = debit;
credit.account_number = "1122";
credit.account_name = "应收账款";
credit.direction = -1;

finance::Voucher voucher{
    "123456789012345678", "2026-08-01", "记-1",
    {debit, credit}, "0.30", "0.30"
};
auto rows = finance::validate_vouchers({voucher});
```
