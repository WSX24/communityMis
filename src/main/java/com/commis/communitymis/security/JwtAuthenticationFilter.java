package com.commis.communitymis.security;

import com.commis.communitymis.common.utils.JwtUtils;
import com.commis.communitymis.module.auth.entity.SysUser;
import com.commis.communitymis.module.auth.service.SysUserService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.List;

/**
 * JWT认证过滤器
 * 从请求头提取Token → 验证 → 检查用户状态 → 注入SecurityContext
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtUtils jwtUtils;
    private final SysUserService sysUserService;

    /** 不需要JWT认证的白名单路径（与SecurityConfig保持一致） */
    private static final List<String> EXCLUDE_PATHS = List.of(
            "/auth/send-code",
            "/auth/register",
            "/auth/login"
    );

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain)
            throws ServletException, IOException {

        // 1. 白名单路径直接放行
        String path = request.getServletPath();
        if (isExcluded(path)) {
            filterChain.doFilter(request, response);
            return;
        }

        // 2. 提取Bearer Token
        String token = extractToken(request);
        if (token == null) {
            // 无Token不在此处拒绝，交给SecurityConfig的.authenticated()规则处理
            filterChain.doFilter(request, response);
            return;
        }

        // 3. Token有效性校验
        if (!jwtUtils.validateToken(token)) {
            log.debug("JWT令牌无效或已过期");
            filterChain.doFilter(request, response);
            return;
        }

        // 4. 解析用户ID与角色
        Long userId;
        Integer role;
        try {
            userId = jwtUtils.getUserIdFromToken(token);
            role = jwtUtils.getRoleFromToken(token);
        } catch (Exception e) {
            log.debug("解析JWT令牌失败: {}", e.getMessage());
            filterChain.doFilter(request, response);
            return;
        }

        // 5. 数据库校验用户是否存在且状态正常
        SysUser user = sysUserService.getById(userId);
        if (user == null || user.getStatus() != 1) {
            log.debug("用户 {} 不存在或已被禁用", userId);
            filterChain.doFilter(request, response);
            return;
        }

        // 6. 构建Spring Security认证对象
        List<SimpleGrantedAuthority> authorities = Collections.singletonList(
                new SimpleGrantedAuthority("ROLE_" + mapRoleCode(role))
        );

        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(userId, null, authorities);

        SecurityContextHolder.getContext().setAuthentication(authentication);
        log.debug("用户 {} (角色: {}) 认证成功", userId, role);

        filterChain.doFilter(request, response);
    }

    /** 从Authorization头提取Bearer Token */
    private String extractToken(HttpServletRequest request) {
        String bearer = request.getHeader("Authorization");
        if (StringUtils.hasText(bearer) && bearer.startsWith("Bearer ")) {
            return bearer.substring(7);
        }
        return null;
    }

    /** 判断是否为白名单路径 */
    private boolean isExcluded(String path) {
        return EXCLUDE_PATHS.stream().anyMatch(path::startsWith);
    }

    /** 角色编号 → Spring Security角色名映射 */
    private String mapRoleCode(Integer role) {
        return switch (role) {
            case 1 -> "USER";
            case 2 -> "ASSIGNEE";
            case 3 -> "JUROR";
            case 4 -> "ADMIN";
            case 5 -> "SUPER_ADMIN";
            default -> "USER";
        };
    }
}
