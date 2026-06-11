package com.commis.communitymis.module.auth.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.commis.communitymis.common.response.Result;
import com.commis.communitymis.module.auth.dto.LoginDTO;
import com.commis.communitymis.module.auth.dto.RegisterDTO;
import com.commis.communitymis.module.auth.dto.SendCodeDTO;
import com.commis.communitymis.module.auth.entity.SysUser;

public interface AuthService extends IService<SysUser> {
    /** 发送邮箱验证码 */
    Result<String> sendVerifyCode(SendCodeDTO dto);
    /** 用户注册 */
    Result<String> register(RegisterDTO dto, String ip);
    /** 用户登录 */
    Result<String> login(LoginDTO dto);
    /** 获取用户信息 */
    Result<SysUser> getUserInfo(Long userId);
}
