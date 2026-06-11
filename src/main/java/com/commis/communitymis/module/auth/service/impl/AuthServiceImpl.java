package com.commis.communitymis.module.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.commis.communitymis.common.response.Result;
import com.commis.communitymis.common.utils.EmailService;
import com.commis.communitymis.common.utils.JwtUtils;
import com.commis.communitymis.common.utils.VerifyCodeStore;
import com.commis.communitymis.module.auth.dto.LoginDTO;
import com.commis.communitymis.module.auth.dto.RegisterDTO;
import com.commis.communitymis.module.auth.dto.SendCodeDTO;
import com.commis.communitymis.module.auth.entity.SysUser;
import com.commis.communitymis.module.auth.mapper.SysUserMapper;
import com.commis.communitymis.module.auth.service.AuthService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.Random;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthServiceImpl extends ServiceImpl<SysUserMapper, SysUser> implements AuthService {

    private final PasswordEncoder passwordEncoder;
    private final JwtUtils jwtUtils;
    private final EmailService emailService;
    private final VerifyCodeStore verifyCodeStore;

    // ==================== 发送邮箱验证码 ====================
    public Result<String> sendVerifyCode(SendCodeDTO dto) {
        String email = dto.getEmail();

        // 1. 注册场景：检查邮箱是否已被注册
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getEmail, email);
        if (count(wrapper) > 0) {
            return Result.error("该邮箱已被注册");
        }

        // 2. 检查发送冷却期（60秒内不能重复发送）
        if (verifyCodeStore.isInCooldown(email)) {
            long seconds = verifyCodeStore.getCooldownSeconds(email);
            return Result.error("请" + seconds + "秒后再发送验证码");
        }

        // 3. 生成6位随机验证码
        String code = String.format("%06d", new Random().nextInt(999999));

        // 4. 存储验证码
        verifyCodeStore.put(email, code);

        // 5. 发送邮件
        String subject = "【社区互助平台】邮箱验证码";
        String content = buildEmailContent(code);
        emailService.sendHtmlMail(email, subject, content);

        log.info("验证码已发送到 {} -> {}", email, code);
        return Result.success("验证码已发送，5分钟内有效", null);
    }

    // ==================== 注册 ====================
    @Override
    public Result<String> register(RegisterDTO dto, String ip) {
        // 1. 校验两次密码一致
        if (!dto.getPassword().equals(dto.getConfirmPassword())) {
            return Result.error("两次密码不一致");
        }

        // 2. 校验验证码
        if (!verifyCodeStore.verify(dto.getEmail(), dto.getVerifyCode())) {
            return Result.error("验证码错误或已过期");
        }

        // 3. 检查用户名唯一性
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getUsername, dto.getUsername());
        if (count(wrapper) > 0) {
            return Result.error("用户名已存在");
        }

        //检查号码唯一性,
        LambdaQueryWrapper<SysUser> phoneWrapper = new LambdaQueryWrapper<>();
        phoneWrapper.eq(SysUser::getPhone, dto.getPhone());
        if (count(phoneWrapper) > 0) {
            return Result.error("电话号码已被注册");
        }

        // 4. 检查邮箱唯一性（防止验证码通过后邮箱被其他请求占用）
        LambdaQueryWrapper<SysUser> emailWrapper = new LambdaQueryWrapper<>();
        emailWrapper.eq(SysUser::getEmail, dto.getEmail());
        if (count(emailWrapper) > 0) {
            return Result.error("该邮箱已被注册");
        }

        // 5. 创建用户
        SysUser user = new SysUser();
        user.setUsername(dto.getUsername());
        user.setPasswordHash(passwordEncoder.encode(dto.getPassword()));
        user.setPhone(dto.getPhone());
        user.setRegisterIp(ip);
        user.setEmail(dto.getEmail());
        user.setNickname(dto.getUsername()); // 默认昵称=用户名
        user.setRole(1);                     // 1=普通用户
        user.setStatus(1);                   // 1=正常
        user.setCreditScore(100);            // 初始信用分100
        user.setCreateTime(new Date());
        user.setUpdateTime(new Date());
        save(user);

        log.info("新用户注册成功 -> {} ({})", dto.getUsername(), dto.getEmail());
        return Result.success("注册成功", null);
    }

    // ==================== 登录 ====================
    @Override
    public Result<String> login(LoginDTO dto) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysUser::getUsername, dto.getUsername());
        SysUser user = getOne(wrapper);
        if (user == null) {
            return Result.error("用户不存在");
        }
        // 检查用户状态
        if (user.getStatus() != 1) {
            return Result.error("账号已被禁用或冻结");
        }
        if (!passwordEncoder.matches(dto.getPassword(), user.getPasswordHash())) {
            return Result.error("密码错误");
        }
        // 更新最后登录信息
        user.setLastLoginTime(new Date());
        user.setUpdateTime(new Date());
        updateById(user);

        return Result.success("登录成功", jwtUtils.generateToken(user.getId(), user.getRole()));
    }

    // ==================== 获取用户信息 ====================
    @Override
    public Result<SysUser> getUserInfo(Long userId) {
        SysUser user = getById(userId);
        if (user == null) {
            return Result.error("用户不存在");
        }
        user.setPasswordHash(null); // 脱敏，不返回密码
        return Result.success(user);
    }

    // 构建邮件HTML内容
    private String buildEmailContent(String code) {
        return """
                <div style="max-width:600px;margin:0 auto;padding:30px;font-family:Arial,sans-serif;">
                    <h2 style="color:#333;text-align:center;">社区互助服务平台</h2>
                    <div style="background:#f5f7fa;border-radius:8px;padding:25px;margin:20px 0;">
                        <p style="color:#666;font-size:14px;">您的邮箱验证码是：</p>
                        <p style="font-size:36px;font-weight:bold;color:#1890ff;text-align:center;letter-spacing:8px;margin:15px 0;">
                            %s
                        </p>
                        <p style="color:#999;font-size:12px;text-align:center;">
                            验证码5分钟内有效，请勿泄露给他人
                        </p>
                    </div>
                </div>
                """.formatted(code);
    }
}
