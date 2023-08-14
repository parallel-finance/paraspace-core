// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/Context.sol";

import "../core/interfaces/IiZiSwapFactory.sol";
import "./WrapToken.sol";

interface IBox {
    function isMintOrAddLiquidity() external view returns(bool);
}

interface IFarmWithWrap {
    function isDeposit() external view returns(bool);
}

contract TokenWithSwapFee is Context, IERC20, IERC20Metadata, Ownable {
    uint8 public override decimals;
    uint8 public feePercent;

    address public wrapToken;
    address public box;
    address public farm;
    address public feeReceiver;

    mapping(address => uint256) private _balances;

    mapping(address => mapping(address => uint256)) private _allowances;

    uint256 private _totalSupply;

    string private _name;
    string private _symbol;

    function name() public view virtual override returns (string memory) {
        return _name;
    }

    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    function totalSupply() public view virtual override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view virtual override returns (uint256) {
        return _balances[account];
    }

    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        _transfer(sender, recipient, amount);

        uint256 currentAllowance = _allowances[sender][_msgSender()];
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
        unchecked {
            _approve(sender, _msgSender(), currentAllowance - amount);
        }

        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) public virtual returns (bool) {
        _approve(_msgSender(), spender, _allowances[_msgSender()][spender] + addedValue);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) public virtual returns (bool) {
        uint256 currentAllowance = _allowances[_msgSender()][spender];
        require(currentAllowance >= subtractedValue, "ERC20: decreased allowance below zero");
        unchecked {
            _approve(_msgSender(), spender, currentAllowance - subtractedValue);
        }

        return true;
    }

    function _mint(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: mint to the zero address");
        _totalSupply += amount;
        _balances[account] += amount;
        emit Transfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: burn from the zero address");
        uint256 accountBalance = _balances[account];
        require(accountBalance >= amount, "ERC20: burn amount exceeds balance");
        unchecked {
            _balances[account] = accountBalance - amount;
        }
        _totalSupply -= amount;

        emit Transfer(account, address(0), amount);
    }

    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) internal virtual {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    constructor(
        string memory name, 
        string memory symbol, 
        uint8 _decimal, 
        uint8 _feePercent,
        address _box,
        address _feeReceiver
    ) {
        _name = name;
        _symbol = symbol;
        _mint(msg.sender, 10000000000000000000000000000);
        decimals = _decimal;
        feePercent = _feePercent;
        require(feePercent < 100, "f100");

        box = _box;

        // bytes32 warpTokenSalt = keccak256(abi.encode(address(this), _name, _symbol));
        
        // wrapToken = address(new WrapToken{salt: warpTokenSalt}(address(this), _name, _symbol));
        feeReceiver = _feeReceiver;
        farm = address(0);
        wrapToken = address(0);
    }

    function setFarm(address _farm) external onlyOwner {
        // restrict owner to set only once
        if (farm == address(0)) {
            farm = _farm;
        }
    }

    function setWrapToken(address _wrapToken) external onlyOwner {
        // restrict owner to set only once
        if (wrapToken == address(0)) {
            wrapToken = _wrapToken;
        }
    }

    function mint(address account, uint256 amount) public onlyOwner {
        _mint(account, amount);
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");
        require(recipient != address(this), "not this!");

        uint256 senderBalance = _balances[sender];
        require(senderBalance >= amount, "ERC20: transfer amount exceeds balance");
        unchecked {
            _balances[sender] = senderBalance - amount;
        }
        uint256 feeAmount = 0;
        if (recipient == wrapToken) {
            bool hasFee = true;
            if (IBox(box).isMintOrAddLiquidity()) {
                hasFee = false;
            }
            if (farm != address(0)) {
                if (IFarmWithWrap(farm).isDeposit()) {
                    hasFee = false;
                }
            }
            if (hasFee) {
                feeAmount = amount * feePercent / 100;
            }
        } else {
            // (bool sx, bytes memory dx) = recipient.staticcall(abi.encodeWithSignature("tokenX()"));
            // (bool sy, bytes memory dy) = recipient.staticcall(abi.encodeWithSignature("tokenY()"));
            // if (sx && sy) {

            // }
        }
        _balances[recipient] += amount - feeAmount;
        _balances[feeReceiver] += feeAmount;

        emit Transfer(sender, recipient, amount);
    }
}
