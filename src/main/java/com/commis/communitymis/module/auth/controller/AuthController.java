package com.commis.communitymis.module.auth.controller;

import com.commis.communitymis.common.response.Result;
import com.commis.communitymis.common.utils.IpUtils;
import com.commis.communitymis.module.auth.dto.LoginDTO;
import com.commis.communitymis.module.auth.dto.RegisterDTO;
import com.commis.communitymis.module.auth.dto.SendCodeDTO;
import com.commis.communitymis.module.auth.entity.SysUser;
import com.commis.communitymis.module.auth.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    /**
     * 发送邮箱验证码
     * POST /api/auth/send-code
     */
    @PostMapping("/send-code")
    public Result<String> sendVerifyCode(@Valid @RequestBody SendCodeDTO dto) {
        return authService.sendVerifyCode(dto);
    }

    /**
     * 用户注册
     * POST /api/auth/register
     */
    @PostMapping("/register")
    public Result<String> register(@Valid @RequestBody RegisterDTO dto, HttpServletRequest request) {
        String ip = IpUtils.getClientIp(request);
        return authService.register(dto, ip);
    }

    /**
     * 用户登录
     * POST /api/auth/login
     */
    @PostMapping("/login")
    public Result<String> login(@Valid @RequestBody LoginDTO dto) {
        return authService.login(dto);
    }

    /**
     * 获取当前用户信息（从SecurityContext中提取已认证的用户ID）
     * GET /api/auth/userinfo
     */
    @GetMapping("/userinfo")
    public Result<SysUser> userInfo() {
        Long userId = (Long) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return authService.getUserInfo(userId);
    }
}
