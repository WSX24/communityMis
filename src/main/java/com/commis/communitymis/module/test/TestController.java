package com.commis.communitymis.module.test;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.commis.communitymis.common.response.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/test")
@RequiredArgsConstructor // 自动注入依赖
public class TestController {

    @GetMapping("/page")
    public Result<Page<Object>> testPage() {
        Page<Object> page = new Page<>(1, 10);
        return Result.success(page);
    }

    @GetMapping("/hello")
    public Result<String> testHello() {
        return Result.success("Hello CommunityMis!");
    }

    /*@GetMapping("/db")
    public Result<List<SysUser>> testDatabase() {
        // 查询sys_user表中的所有用户
        List<SysUser> userList = userMapper.selectList(new LambdaQueryWrapper<>());
        return Result.success(userList);
    }*/
}