package com.commis.communitymis.common.utils;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 内存验证码存储（开发环境使用，生产环境建议换Redis）
 */
@Slf4j
@Component
public class VerifyCodeStore {

    /** 验证码有效期：5分钟 */
    private static final long EXPIRE_MS = 5 * 60 * 1000;

    /** 发送间隔限制：60秒 */
    private static final long SEND_INTERVAL_MS = 60 * 1000;

    /** 存储：email -> CodeEntry(验证码, 创建时间) */
    private final Map<String, CodeEntry> codeMap = new ConcurrentHashMap<>();

    /**
     * 存储验证码
     */
    public void put(String email, String code) {
        codeMap.put(email, new CodeEntry(code, System.currentTimeMillis()));
        log.debug("验证码已存储 -> {}: {}", email, code);
    }

    /**
     * 校验验证码是否正确且在有效期内
     * @return true=验证通过, false=验证码错误或过期
     */
    public boolean verify(String email, String code) {
        CodeEntry entry = codeMap.get(email);
        if (entry == null) {
            log.debug("验证码不存在 -> {}", email);
            return false;
        }
        // 检查是否过期
        if (System.currentTimeMillis() - entry.createTime > EXPIRE_MS) {
            codeMap.remove(email);
            log.debug("验证码已过期 -> {}", email);
            return false;
        }
        // 校验验证码（忽略大小写）
        boolean matched = entry.code.equalsIgnoreCase(code);
        if (matched) {
            codeMap.remove(email); // 验证成功后立即删除，防止重复使用
            log.debug("验证码校验成功 -> {}", email);
        }
        return matched;
    }

    /**
     * 检查是否在发送冷却期内（防止频繁发送）
     * @return true=冷却中不能发送
     */
    public boolean isInCooldown(String email) {
        CodeEntry entry = codeMap.get(email);
        if (entry == null) return false;
        return System.currentTimeMillis() - entry.createTime < SEND_INTERVAL_MS;
    }

    /**
     * 获取剩余冷却秒数
     */
    public long getCooldownSeconds(String email) {
        CodeEntry entry = codeMap.get(email);
        if (entry == null) return 0;
        long elapsed = System.currentTimeMillis() - entry.createTime;
        if (elapsed >= SEND_INTERVAL_MS) return 0;
        return (SEND_INTERVAL_MS - elapsed) / 1000;
    }

    /** 内部存储条目 */
    private record CodeEntry(String code, long createTime) {}
}
