import { ACTIVE_STATUS } from "../auth/store.mjs";
import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "../http.mjs";
import { createMysqlPool } from "../mysql/pool.mjs";

const MESSAGE_READ_RE = /^\/api\/messages\/([^/]+)\/read$/;
const MESSAGE_RECALL_RE = /^\/api\/messages\/([^/]+)$/;
const REQUEST_COMMENTS_RE = /^\/api\/requests\/([^/]+)\/comments$/;
const COMMENT_LIKE_RE = /^\/api\/request-comments\/([^/]+)\/like$/;
const COMMUNITY_POST_DETAIL_RE = /^\/api\/community-posts\/([^/]+)$/;
const COMMUNITY_POST_LIKE_RE = /^\/api\/community-posts\/([^/]+)\/like$/;
const COMMUNITY_POST_COLLECT_RE = /^\/api\/community-posts\/([^/]+)\/collect$/;
const COMMUNITY_POST_COMMENTS_RE = /^\/api\/community-posts\/([^/]+)\/comments$/;
const COMMUNITY_COMMENT_LIKE_RE = /^\/api\/community-post-comments\/([^/]+)\/like$/;
const COLLECTION_DETAIL_RE = /^\/api\/collections\/([^/]+)\/([^/]+)$/;
const USER_FOLLOW_RE = /^\/api\/users\/([^/]+)\/follow$/;
const USER_CONTACT_RE = /^\/api\/users\/([^/]+)\/contact$/;
const SOCIAL_BODY_MAX_BYTES = 64 * 1024;

export async function handleSocialRoutes({ request, response, url, authService }) {
  if (url.pathname === "/api/feed") {
    allowOnly(request, response, ["GET"]);
    const viewer = await optionalContext(request, authService);
    sendJson(response, 200, await feedPayload(authService.store, url.searchParams, viewer?.user?.userId ?? null));
    return true;
  }

  if (url.pathname === "/api/community-posts") {
    allowOnly(request, response, ["GET", "POST"]);
    if (request.method === "GET") {
      const viewer = await optionalContext(request, authService);
      sendJson(response, 200, await communityPostListPayload(authService.store, url.searchParams, viewer?.user?.userId ?? null));
      return true;
    }
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const body = await readJsonBody(request, { maxBytes: SOCIAL_BODY_MAX_BYTES });
    const input = normalizeCommunityPostInput(body);
    await assertContentAllowed(authService.store, [input.title, input.content, ...input.tags], {
      userId: context.user.userId,
      sourceType: "community_post",
      title: input.title
    });
    ensureStoreMethod(authService.store, "createCommunityPost", "COMMUNITY_POST_STORE_UNAVAILABLE");
    const post = await authService.store.createCommunityPost({
      ...input,
      authorId: context.user.userId
    });
    sendJson(response, 201, { post: communityPostDto(post) });
    return true;
  }

  const communityPostLikeMatch = url.pathname.match(COMMUNITY_POST_LIKE_RE);
  if (communityPostLikeMatch) {
    allowOnly(request, response, ["POST", "DELETE"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const method = request.method === "POST" ? "likeCommunityPost" : "unlikeCommunityPost";
    ensureStoreMethod(authService.store, method, "COMMUNITY_POST_STORE_UNAVAILABLE");
    const post = await authService.store[method]({
      postId: parseId(communityPostLikeMatch[1], "POST_NOT_FOUND"),
      userId: context.user.userId
    });
    if (request.method === "POST") notifyCommunityPostLike(authService.store, post, context.user.userId);
    sendJson(response, 200, { post: communityPostDto(post) });
    return true;
  }

  const communityPostCollectMatch = url.pathname.match(COMMUNITY_POST_COLLECT_RE);
  if (communityPostCollectMatch) {
    allowOnly(request, response, ["POST", "DELETE"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const method = request.method === "POST" ? "collectCommunityPost" : "uncollectCommunityPost";
    ensureStoreMethod(authService.store, method, "COMMUNITY_POST_STORE_UNAVAILABLE");
    const result = await authService.store[method]({
      postId: parseId(communityPostCollectMatch[1], "POST_NOT_FOUND"),
      userId: context.user.userId
    });
    const post = typeof authService.store.findCommunityPostById === "function"
      ? await authService.store.findCommunityPostById(communityPostCollectMatch[1], context.user.userId)
      : null;
    sendJson(response, 200, { collection: result, post: post ? communityPostDto(post) : null });
    return true;
  }

  const communityPostCommentsMatch = url.pathname.match(COMMUNITY_POST_COMMENTS_RE);
  if (communityPostCommentsMatch) {
    allowOnly(request, response, ["GET", "POST"]);
    const postId = parseId(communityPostCommentsMatch[1], "POST_NOT_FOUND");
    if (request.method === "GET") {
      const viewer = await optionalContext(request, authService);
      ensureStoreMethod(authService.store, "listCommunityPostComments", "COMMUNITY_POST_STORE_UNAVAILABLE");
      sendJson(response, 200, {
        comments: (await authService.store.listCommunityPostComments(postId, viewer?.user?.userId ?? null)).map(commentDto)
      });
      return true;
    }
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const body = await readJsonBody(request, { maxBytes: 16 * 1024 });
    const content = requiredText(body.content, 1, 1000, "INVALID_COMMENT");
    await assertContentAllowed(authService.store, [content], {
      userId: context.user.userId,
      sourceType: "community_post_comment",
      title: "帖子评论"
    });
    ensureStoreMethod(authService.store, "createCommunityPostComment", "COMMUNITY_POST_STORE_UNAVAILABLE");
    const comment = await authService.store.createCommunityPostComment({
      postId,
      userId: context.user.userId,
      parentId: optionalId(body.parentId),
      content
    });
    notifyCommunityPostComment(authService.store, postId, context.user.userId, body.parentId);
    sendJson(response, 201, { comment: commentDto(comment) });
    return true;
  }

  const communityCommentLikeMatch = url.pathname.match(COMMUNITY_COMMENT_LIKE_RE);
  if (communityCommentLikeMatch) {
    allowOnly(request, response, ["POST", "DELETE"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const method = request.method === "POST" ? "likeCommunityPostComment" : "unlikeCommunityPostComment";
    ensureStoreMethod(authService.store, method, "COMMUNITY_POST_STORE_UNAVAILABLE");
    const comment = await authService.store[method]({
      commentId: parseId(communityCommentLikeMatch[1], "COMMENT_NOT_FOUND"),
      userId: context.user.userId
    });
    if (request.method === "POST") notifyCommunityCommentLike(authService.store, comment, context.user.userId);
    sendJson(response, 200, { comment: commentDto(comment) });
    return true;
  }


  // PUT/DELETE community post (before GET avoid allowOnly conflict)
  {
    const m = url.pathname.match(COMMUNITY_POST_DETAIL_RE);
    if (m && (request.method === "PUT" || request.method === "DELETE")) {
      const context = await authService.authenticateRequest(request);
      authService.requireRole(context, ["user"]);
      const postId = parseId(m[1], "POST_NOT_FOUND");
      const pool = await getFeedPool();
      const [owner] = await pool.execute("SELECT author_id AS authorId FROM community_post WHERE post_id = ? AND status = 'published'", [postId]);
      if (!owner.length) throw new HttpError(404, "POST_NOT_FOUND", "Post was not found.");
      if (Number(owner[0].authorId) !== Number(context.user.userId)) throw new HttpError(403, "FORBIDDEN", "Only the author can perform this action.");
      if (request.method === "DELETE") {
        await pool.execute("UPDATE community_post SET status = 'deleted' WHERE post_id = ?", [postId]);
        sendJson(response, 200, { postId, status: "deleted" });
        return true;
      }
      const body = await readJsonBody(request, { maxBytes: 16 * 1024 });
      const updates = [], params = [];
      if (body.title) { updates.push("title = ?"); params.push(String(body.title).trim()); }
      if (body.content) { updates.push("content = ?"); params.push(String(body.content).trim()); }
      if (updates.length) { params.push(postId); await pool.execute("UPDATE community_post SET " + updates.join(", ") + " WHERE post_id = ?", params); }
      const [rows] = await pool.execute("SELECT p.post_id AS postId, p.author_id AS authorId, p.title, p.content, p.created_at AS createdAt, u.username AS authorName FROM community_post p JOIN user u ON u.user_id = p.author_id WHERE p.post_id = ?", [postId]);
      const r = rows[0];
      const post = { postId: r.postId, authorId: r.authorId, title: r.title, content: r.content, createdAt: r.createdAt, author: { userId: r.authorId, username: r.authorName, displayName: r.authorName }, tags: [], imageFileIds: [], likeCount: 0, commentCount: 0 };
      sendJson(response, 200, { post: communityPostDto(post) });
      return true;
    }
  }

  const communityPostDetailMatch = url.pathname.match(COMMUNITY_POST_DETAIL_RE);
  if (communityPostDetailMatch) {
    allowOnly(request, response, ["GET"]);
    const viewer = await optionalContext(request, authService);
    const postId = parseId(communityPostDetailMatch[1], "POST_NOT_FOUND");
    const pool = await getFeedPool();
    const [rows] = await pool.execute(
      `SELECT p.post_id AS postId, p.author_id AS authorId, p.title, p.content,
              p.tags_json AS tags, p.like_count AS likeCount,
              p.comment_count AS commentCount, p.created_at AS createdAt,
              u.username AS authorName
       FROM community_post p
       JOIN user u ON u.user_id = p.author_id
       WHERE p.post_id = ? AND p.status = 'published'`,
      [postId]
    );
    if (!rows?.length) {
      throw new HttpError(404, "POST_NOT_FOUND", "Community post was not found.");
    }
    const r = rows[0];
    const post = {
      postId: r.postId, authorId: r.authorId, title: r.title, content: r.content,
      tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags ?? []),
      likeCount: r.likeCount ?? 0, commentCount: r.commentCount ?? 0,
      createdAt: r.createdAt,
      author: { userId: r.authorId, username: r.authorName, displayName: r.authorName }
    };
const _comments = typeof authService.store.listCommunityPostComments === "function" ? await authService.store.listCommunityPostComments(postId, viewer?.user?.userId ?? null) : [];
    let _imgs=[];try{const pool=await getFeedPool();const[r2]=await pool.execute("SELECT cpi.file_id AS fileId FROM community_post_image cpi WHERE cpi.post_id=? ORDER BY cpi.sort_order ASC",[postId]);_imgs=(r2||[]).map(r=>({fileId:r.fileId,url:"/api/files/"+encodeURIComponent(r.fileId)}));}catch(e){} post.imageFileIds=_imgs.map(r=>r.fileId); sendJson(response,200,{post:communityPostDto(post),comments:_comments});
    return true;
  }

  if (url.pathname === "/api/messages" && request.method === "POST") {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const body = await readJsonBody(request, { maxBytes: SOCIAL_BODY_MAX_BYTES });
    const message = await createMessagePayload(authService.store, context.user.userId, body);
    sendJson(response, 201, { message });
    return true;
  }

  if (url.pathname === "/api/messages/thread" && request.method === "DELETE") {
    allowOnly(request, response, ["DELETE"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const body = await readJsonBody(request, { maxBytes: 8 * 1024 });
    ensureStoreMethod(authService.store, "deleteMessageThread", "MESSAGE_STORE_UNAVAILABLE");
    const result = await authService.store.deleteMessageThread({
      viewerId: context.user.userId,
      userId: parseId(body.userId, "USER_NOT_FOUND"),
      orderId: optionalId(body.orderId)
    });
    sendJson(response, 200, { deleted: result?.deleted ?? 0 });
    return true;
  }

  if (url.pathname === "/api/messages/thread") {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    ensureStoreMethod(authService.store, "listMessageThread", "MESSAGE_STORE_UNAVAILABLE");
    const thread = await authService.store.listMessageThread({
      viewerId: context.user.userId,
      userId: parseId(url.searchParams.get("userId"), "USER_NOT_FOUND"),
      orderId: optionalId(url.searchParams.get("orderId")),
      page: parsePositiveQuery(url.searchParams.get("page"), 1),
      pageSize: parsePositiveQuery(url.searchParams.get("pageSize") ?? url.searchParams.get("limit"), 50)
    });
    sendJson(response, 200, {
      ...thread,
      messages: (thread.messages ?? []).map(messageDto)
    });
    return true;
  }

  if (url.pathname === "/api/messages/thread/read") {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const body = await readJsonBody(request, { maxBytes: 8 * 1024 });
    ensureStoreMethod(authService.store, "markMessageThreadRead", "MESSAGE_STORE_UNAVAILABLE");
    const result = await authService.store.markMessageThreadRead({
      viewerId: context.user.userId,
      userId: parseId(body.userId, "USER_NOT_FOUND"),
      orderId: optionalId(body.orderId)
    });
    sendJson(response, 200, result);
    return true;
  }

  if (url.pathname === "/api/users/me/collections") {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    ensureStoreMethod(authService.store, "listCollectionsForUserId", "COLLECTION_STORE_UNAVAILABLE");
    const result = await authService.store.listCollectionsForUserId(context.user.userId, {
      targetType: url.searchParams.get("targetType") ?? url.searchParams.get("type") ?? "all",
      page: parsePositiveQuery(url.searchParams.get("page"), 1),
      pageSize: parsePositiveQuery(url.searchParams.get("pageSize") ?? url.searchParams.get("limit"), 20)
    });
    sendJson(response, 200, {
      collections: (result.collections ?? []).map(collectionDto),
      pagination: paginationDto(parsePositiveQuery(url.searchParams.get("page"), 1), parsePositiveQuery(url.searchParams.get("pageSize") ?? url.searchParams.get("limit"), 20), Number(result.total ?? 0))
    });
    return true;
  }

  if (url.pathname === "/api/collections") {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const body = await readJsonBody(request, { maxBytes: 8 * 1024 });
    ensureStoreMethod(authService.store, "createCollection", "COLLECTION_STORE_UNAVAILABLE");
    const collection = await authService.store.createCollection({
      userId: context.user.userId,
      targetType: body.targetType,
      targetId: parseId(body.targetId, "COLLECTION_TARGET_NOT_FOUND")
    });
    sendJson(response, 201, { collection });
    return true;
  }

  const collectionMatch = url.pathname.match(COLLECTION_DETAIL_RE);
  if (collectionMatch) {
    allowOnly(request, response, ["DELETE"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    ensureStoreMethod(authService.store, "deleteCollection", "COLLECTION_STORE_UNAVAILABLE");
    const collection = await authService.store.deleteCollection({
      userId: context.user.userId,
      targetType: decodeURIComponent(collectionMatch[1]),
      targetId: parseId(collectionMatch[2], "COLLECTION_TARGET_NOT_FOUND")
    });
    sendJson(response, 200, { collection });
    return true;
  }

  const messageRecallMatch = url.pathname.match(MESSAGE_RECALL_RE);
  if (messageRecallMatch) {
    allowOnly(request, response, ["DELETE"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    ensureStoreMethod(authService.store, "recallMessage", "MESSAGE_STORE_UNAVAILABLE");
    let result;
    try {
      result = await authService.store.recallMessage({
        messageId: parseId(messageRecallMatch[1], "MESSAGE_NOT_FOUND"),
        userId: context.user.userId
      });
    } catch (error) {
      if (error?.code === "RECALL_TIME_EXCEEDED") {
        throw new HttpError(409, "RECALL_TIME_EXCEEDED", error.message);
      }
      throw error;
    }
    if (!result) {
      throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message was not found or cannot be recalled.");
    }
    sendJson(response, 200, { message: messageDto(result), recalled: true });
    return true;
  }

  const messageReadMatch = url.pathname.match(MESSAGE_READ_RE);
  if (messageReadMatch) {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    ensureStoreMethod(authService.store, "markMessageRead", "MESSAGE_STORE_UNAVAILABLE");
    const message = await authService.store.markMessageRead(context.user.userId, parseId(messageReadMatch[1], "MESSAGE_NOT_FOUND"));
    if (!message) {
      throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message was not found.");
    }
    sendJson(response, 200, { message });
    return true;
  }

  const commentsMatch = url.pathname.match(REQUEST_COMMENTS_RE);
  if (commentsMatch) {
    allowOnly(request, response, ["GET", "POST"]);
    const requestId = parseId(commentsMatch[1], "REQUEST_NOT_FOUND");
    if (request.method === "GET") {
      const viewer = await optionalContext(request, authService);
      ensureStoreMethod(authService.store, "listRequestComments", "COMMENT_STORE_UNAVAILABLE");
      sendJson(response, 200, {
        comments: await authService.store.listRequestComments(requestId, viewer?.user?.userId ?? null)
      });
      return true;
    }
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const body = await readJsonBody(request, { maxBytes: 16 * 1024 });
    const comment = await createCommentPayload(authService.store, requestId, context.user.userId, body);
    notifyRequestComment(authService.store, requestId, context.user.userId, body.parentId);
    sendJson(response, 201, { comment });
    return true;
  }

  const likeMatch = url.pathname.match(COMMENT_LIKE_RE);
  if (likeMatch) {
    allowOnly(request, response, ["POST", "DELETE"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const method = request.method === "POST" ? "likeRequestComment" : "unlikeRequestComment";
    ensureStoreMethod(authService.store, method, "COMMENT_STORE_UNAVAILABLE");
    const comment = await authService.store[method]({
      commentId: parseId(likeMatch[1], "COMMENT_NOT_FOUND"),
      userId: context.user.userId
    });
    if (request.method === "POST") notifyRequestCommentLike(authService.store, comment, context.user.userId);
    sendJson(response, 200, { comment });
    return true;
  }

  const followMatch = url.pathname.match(USER_FOLLOW_RE);
  if (followMatch) {
    allowOnly(request, response, ["POST", "DELETE"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const method = request.method === "POST" ? "followUser" : "unfollowUser";
    ensureStoreMethod(authService.store, method, "FOLLOW_STORE_UNAVAILABLE");
    const result = await authService.store[method]({
      followerId: context.user.userId,
      followeeId: parseId(followMatch[1], "USER_NOT_FOUND")
    });
    sendJson(response, 200, result);
    return true;
  }

  const contactMatch = url.pathname.match(USER_CONTACT_RE);
  if (contactMatch) {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    const user = await findActiveUser(authService.store, contactMatch[1]);
    const contact = await contactPayload(authService.store, user, context.user);
    sendJson(response, 200, { user: publicUser(user), contact });
    return true;
  }

  if (url.pathname === "/api/users/me/avatar") {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["user"]);
    const body = await readJsonBody(request, { maxBytes: 8 * 1024 });
    ensureStoreMethod(authService.store, "updateUserAvatar", "USER_STORE_UNAVAILABLE");
    const user = await authService.store.updateUserAvatar(context.user.userId, String(body.fileId ?? ""));
    if (!user) {
      throw new HttpError(404, "FILE_NOT_FOUND", "Avatar file was not found.");
    }
    sendJson(response, 200, { user: publicUser(user) });
    return true;
  }

  return false;
}

async function createMessagePayload(store, senderId, body) {
  ensureStoreMethod(store, "createMessage", "MESSAGE_STORE_UNAVAILABLE");
  const receiverId = parseId(body.receiverId ?? body.toUserId, "USER_NOT_FOUND");
  const content = optionalText(body.content ?? body.message, 2000) ?? "";
  const attachments = normalizeAttachments(body.attachments);
  if (!content && attachments.length === 0) {
    throw new HttpError(400, "INVALID_MESSAGE", "Message content or attachment is required.");
  }
  return messageDto(await store.createMessage({
    senderId,
    receiverId,
    orderId: optionalId(body.orderId),
    businessType: optionalText(body.businessType, 40),
    businessId: optionalId(body.businessId),
    content,
    attachments
  }));
}

async function createCommentPayload(store, requestId, userId, body) {
  ensureStoreMethod(store, "createRequestComment", "COMMENT_STORE_UNAVAILABLE");
  return store.createRequestComment({
    requestId,
    userId,
    parentId: optionalId(body.parentId),
    content: requiredText(body.content, 1, 1000, "INVALID_COMMENT")
  });
}

async function contactPayload(store, targetUser, viewer) {
  if (Number(targetUser.userId) === Number(viewer.userId)) {
    return fullContact(targetUser);
  }
  const settings = typeof store.findSettingsByUserId === "function"
    ? await store.findSettingsByUserId(targetUser.userId)
    : null;
  const follows = typeof store.isFollowing === "function"
    ? await store.isFollowing(viewer.userId, targetUser.userId)
    : false;
  const phoneVisible = Boolean(settings?.privacy?.phoneVisible);
  return {
    phone: phoneVisible || follows ? targetUser.phone ?? null : null,
    maskedPhone: targetUser.phone ? maskPhone(targetUser.phone) : null,
    visibility: phoneVisible ? "public" : follows ? "follower" : "private"
  };
}

async function feedPayload(store, searchParams, viewerId = null) {
  const page = parsePositiveQuery(searchParams.get("page"), 1);
  const pageSize = Math.min(50, parsePositiveQuery(searchParams.get("pageSize") ?? searchParams.get("limit"), 10));
  const keyword = optionalText(searchParams.get("keyword") ?? searchParams.get("q"), 100);
  const category = optionalText(searchParams.get("category"), 50);
  const tag = optionalText(searchParams.get("tag"), 50);
  let postResult = { posts: [], total: 0 };
  try {
    postResult = await simpleCommunityPosts(store, viewerId, keyword);
  } catch { /* community posts optional */ }
  let requestItems = [];
  try {
    if (typeof store.listServiceRequests === "function") {
      requestItems = await feedRequestItems(store, keyword, category, tag);
    }
  } catch { /* requests optional */ }
  const items = [
    ...((postResult.posts ?? []).map((post) => ({ type: "community_post", sortAt: post.createdAt, post: communityPostDto(post) }))),
    ...requestItems
  ].sort((left, right) => new Date(right.sortAt).getTime() - new Date(left.sortAt).getTime());
  const total = items.length;
  const offset = (page - 1) * pageSize;
  return {
    items: items.slice(offset, offset + pageSize),
    pagination: paginationDto(page, pageSize, total)
  };
}

async function feedRequestItems(store, keyword, category = null, tag = null) {
  const categories = typeof store.listCategories === "function" ? await store.listCategories() : [];
  const categoryMap = new Map(categories.map((category) => [Number(category.categoryId), category]));
  const requests = await store.listServiceRequests();
  const keywordText = keyword?.toLowerCase() ?? null;
  const output = [];
  for (const item of requests) {
    if (String(item.status ?? "") !== "open" || item.visible === false) {
      continue;
    }
    if (keywordText && ![item.title, item.description, item.location, ...(item.tags ?? [])].filter(Boolean).join(" ").toLowerCase().includes(keywordText)) {
      continue;
    }
    if (category && String(item.categoryId ?? "") !== category && String(item.category?.code ?? "") !== category) {
      continue;
    }
    if (tag && !(item.tags ?? []).some(t => String(t).toLowerCase().includes(tag.toLowerCase()))) {
      continue;
    }
    const publisher = typeof store.findUserById === "function" ? await store.findUserById(item.publisherId) : null;
    output.push({
      type: "request",
      sortAt: item.createdAt,
      request: {
        requestId: item.requestId,
        title: item.title,
        description: item.description,
        descriptionSummary: summarize(item.description),
        location: item.location,
        estimatedHours: item.estimatedHours,
        coinAmount: item.coinAmount,
        status: item.status,
        tags: item.tags ?? [],
        category: item.category ?? categoryMap.get(Number(item.categoryId)) ?? null,
        publisher: publisher ? publicUser(publisher) : null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        href: `/posts/${encodeURIComponent(item.requestId)}`
      }
    });
  }
  return output;
}

async function communityPostListPayload(store, searchParams, viewerId = null) {
  const page = parsePositiveQuery(searchParams.get("page"), 1);
  const pageSize = Math.min(50, parsePositiveQuery(searchParams.get("pageSize") ?? searchParams.get("limit"), 20));
  const keyword = searchParams.get("keyword") ?? searchParams.get("q");
  const authorId = searchParams.get("authorId") ?? searchParams.get("publisherId");

  // Use simpleCommunityPosts which works reliably
  let result;
  try {
    result = await simpleCommunityPosts(store, viewerId, keyword);
  } catch {
    result = { posts: [], total: 0 };
  }

  let posts = result.posts ?? [];
  if (authorId) {
    posts = posts.filter(p => String(p.author?.userId) === String(authorId));
  }
  const total = posts.length;
  const paged = posts.slice((page - 1) * pageSize, page * pageSize);

  return {
    posts: paged.map(communityPostDto),
    pagination: paginationDto(page, pageSize, total)
  };
}

function communityPostDto(post) {
  return {
    postId: post.postId,
    authorId: post.authorId,
    author: post.author ? publicUser(post.author) : null,
    category: post.category ?? null,
    title: post.title,
    content: post.content,
    contentSummary: summarize(post.content),
    tags: post.tags ?? [],
    imageFileIds: post.imageFileIds ?? [],
    images: (post.imageFileIds ?? []).map((fileId) => ({ fileId, url: `/api/files/${encodeURIComponent(fileId)}` })),
    visibility: post.visibility ?? "community",
    status: post.status ?? "published",
    likeCount: Number(post.likeCount ?? 0),
    commentCount: Number(post.commentCount ?? 0),
    collectCount: Number(post.collectCount ?? 0),
    likedByViewer: Boolean(post.likedByViewer),
    collectedByViewer: Boolean(post.collectedByViewer),
    href: `/community-posts/${encodeURIComponent(post.postId)}`,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt
  };
}

function commentDto(comment) {
  return {
    commentId: comment.commentId,
    postId: comment.postId,
    requestId: comment.requestId,
    userId: comment.userId,
    parentId: comment.parentId,
    content: comment.content,
    likeCount: Number(comment.likeCount ?? 0),
    likedByViewer: Boolean(comment.likedByViewer),
    user: comment.user ? publicUser(comment.user) : null,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt
  };
}

function collectionDto(item) {
  return {
    userId: item.userId,
    targetType: item.targetType,
    targetId: item.targetId,
    target: item.target,
    createdAt: item.createdAt
  };
}

function messageDto(message) {
  return {
    messageId: message.messageId,
    senderId: message.senderId,
    receiverId: message.receiverId,
    sender: message.sender ? publicUser(message.sender) : null,
    receiver: message.receiver ? publicUser(message.receiver) : null,
    orderId: message.orderId,
    businessType: message.businessType,
    businessId: message.businessId,
    content: message.content,
    attachments: normalizeAttachments(message.attachments),
    isRead: Boolean(message.isRead),
    readAt: message.readAt ?? null,
    createdAt: message.createdAt
  };
}

function normalizeCommunityPostInput(input) {
  const title = requiredText(input.title, 1, 100, "INVALID_POST_TITLE");
  const content = requiredText(input.content ?? input.body ?? input.description, 1, 5000, "INVALID_POST_CONTENT");
  return {
    title,
    content,
    categoryId: optionalId(input.categoryId),
    tags: normalizeTextList(input.tags ?? input.tagNames, 20, 30),
    imageFileIds: normalizeFileIds(input.imageFileIds ?? input.fileIds ?? input.images),
    visibility: ["community", "nearby", "private"].includes(String(input.visibility ?? "")) ? String(input.visibility) : "community"
  };
}

async function assertContentAllowed(store, fields, context = {}) {
  const rules = typeof store.listActiveSensitiveWords === "function"
    ? await store.listActiveSensitiveWords()
    : [];
  const text = fields.map((item) => String(item ?? "").toLowerCase()).join("\n");
  const hits = rules.filter((rule) => text.includes(String(rule.word ?? "").toLowerCase()));
  if (hits.some((hit) => hit.level === "block")) {
    if (typeof store.createRiskContent === "function") {
      await store.createRiskContent({
        sourceType: context.sourceType ?? "content",
        sourceId: context.sourceId ?? null,
        userId: context.userId ?? null,
        title: context.title ?? "内容发布",
        content: fields.join("\n"),
        hits,
        status: "pending"
      });
    }
    const first = hits[0];
    throw new HttpError(400, "SENSITIVE_CONTENT", `内容命中敏感词「${first.word}」。`);
  }
}

function fullContact(user) {
  return {
    phone: user.phone ?? null,
    maskedPhone: user.phone ? maskPhone(user.phone) : null,
    visibility: "self"
  };
}

async function findActiveUser(store, rawUserId) {
  const user = await store.findUserById(parseId(rawUserId, "USER_NOT_FOUND"));
  if (!user || user.status !== ACTIVE_STATUS) {
    throw new HttpError(404, "USER_NOT_FOUND", "User was not found.");
  }
  return user;
}

async function optionalContext(request, authService) {
  try {
    return await authService.authenticateRequest(request);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

function publicUser(user) {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName ?? user.username,
    avatarFileId: user.avatarFileId ?? null,
    avatarUrl: user.avatarFileId ? `/api/files/${encodeURIComponent(user.avatarFileId)}` : null
  };
}

function ensureStoreMethod(store, method, code) {
  if (typeof store?.[method] !== "function") {
    throw new HttpError(500, code, "Required store capability is not available.");
  }
}

function parseId(raw, code) {
  if (!/^\d+$/.test(String(raw ?? ""))) {
    throw new HttpError(404, code, "Requested resource was not found.");
  }
  return Number(raw);
}

function optionalId(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  return parseId(raw, "INVALID_ID");
}

function parsePositiveQuery(raw, fallback) {
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  if (!/^\d+$/.test(String(raw))) {
    throw new HttpError(400, "INVALID_PAGE", "Expected a positive integer.");
  }
  return Math.max(1, Number(raw));
}

function requiredText(value, minLength, maxLength, code) {
  const text = optionalText(value, maxLength);
  if (!text || text.length < minLength) {
    throw new HttpError(400, code, "Required text is missing or invalid.");
  }
  return text;
}

function normalizeTextList(value, maxItems, maxLength) {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string" ? value.split(/[，,]/) : [];
  return list
    .map((item) => optionalText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeFileIds(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item) => {
      if (item && typeof item === "object") {
        return optionalText(item.fileId ?? item.id, 80);
      }
      return optionalText(item, 80);
    })
    .filter(Boolean)
    .slice(0, 9);
}

function normalizeAttachments(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const fileId = optionalText(item.fileId, 80);
      if (!fileId) {
        return null;
      }
      return {
        fileId,
        url: item.url ?? `/api/files/${encodeURIComponent(fileId)}`,
        purpose: optionalText(item.purpose, 40),
        originalName: optionalText(item.originalName, 255),
        mimeType: optionalText(item.mimeType, 120),
        sizeBytes: Number(item.sizeBytes ?? 0)
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function paginationDto(page, pageSize, total) {
  const totalPages = Math.ceil(total / pageSize);
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1 && totalPages > 0
  };
}

function summarize(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}

function optionalText(value, maxLength) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  if (text.length > maxLength) {
    throw new HttpError(400, "INVALID_FIELD", "One or more fields are too long.");
  }
  return text || null;
}

function maskPhone(phone) {
  return String(phone).replace(/^(\+?\d{3})\d+(\d{2,4})$/, "$1****$2");
}

let _feedPool = null;
async function getFeedPool() {
  if (!_feedPool) {
    _feedPool = await createMysqlPool({
      host: process.env.DB_HOST ?? "127.0.0.1",
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER ?? "community_mis",
      password: process.env.DB_PASSWORD ?? "",
      database: process.env.DB_NAME ?? "community_mis"
    });
  }
  return _feedPool;
}

async function simpleCommunityPosts(store, viewerId, keyword) {
  const pool = await getFeedPool();
  const params = [];
  let where = "WHERE p.status = 'published'";
  if (keyword) {
    where += " AND (p.title LIKE ? OR p.content LIKE ?)";
    const like = `%${keyword}%`;
    params.push(like, like);
  }

  const [rows] = await pool.execute(`
    SELECT p.post_id AS postId, p.author_id AS authorId, p.title,
           LEFT(p.content, 200) AS content, p.tags_json AS tags,
           p.like_count AS likeCount, p.comment_count AS commentCount,
           p.created_at AS createdAt,
           u.username AS authorName, u.username AS authorDisplay, COALESCE((SELECT JSON_ARRAYAGG(cpi.file_id) FROM community_post_image cpi WHERE cpi.post_id = p.post_id), JSON_ARRAY()) AS imageFileIds
    FROM community_post p
    JOIN user u ON u.user_id = p.author_id
    ${where}
    ORDER BY p.created_at DESC
    LIMIT 100
  `, params);

  const posts = rows.map(r => ({
    postId: r.postId,
    title: r.title,
    content: r.content,
    tags: typeof r.tags === "string" ? JSON.parse(r.tags) : (r.tags ?? []), imageFileIds: Array.isArray(r.imageFileIds) ? r.imageFileIds.map(String) : [],
    likeCount: r.likeCount ?? 0,
    commentCount: r.commentCount ?? 0,
    createdAt: r.createdAt,
    author: { userId: r.authorId, username: r.authorName, displayName: r.authorDisplay }
  }));

  return { posts, total: posts.length };
}

function allowOnly(request, response, methods) {
  if (!methods.includes(request.method)) {
    methodNotAllowed(response, methods);
    throw new HttpError(0, "HANDLED", "Response was already handled.");
  }
}

/* ===== Notification helpers ===== */

async function safeNotify(store, input) {
  if (typeof store.createNotification !== "function") return;
  if (!input.userId || input.userId === input.actorId) return;
  try { await store.createNotification(input); } catch {}
}

// 需求评论通知
async function notifyRequestComment(store, requestId, userId, parentId) {
  try {
    const commenter = await store.findUserById(userId);
    const name = commenter?.displayName ?? commenter?.username ?? String(userId);
    const request = typeof store.findServiceRequestById === "function"
      ? await store.findServiceRequestById(requestId) : null;
    const title = request?.title ?? "";

    // 通知需求发布者
    if (request && request.publisherId !== userId) {
      const msg = parentId ? "回复了你的需求下的评论" : "评论了你的需求";
      await safeNotify(store, {
        userId: request.publisherId, actorId: userId, type: "social",
        title: "新的评论", content: name + " " + msg + "「" + title + "」",
        businessType: "request", businessId: requestId
      });
    }
    // 通知被回复者
    if (parentId && typeof store.listRequestComments === "function") {
      const comments = await store.listRequestComments(requestId);
      const parent = comments.find(function(c) { return c.commentId === Number(parentId); });
      if (parent && parent.userId !== userId && parent.userId !== request?.publisherId) {
        await safeNotify(store, {
          userId: parent.userId, actorId: userId, type: "social",
          title: "评论被回复", content: name + " 回复了你的评论",
          businessType: "request", businessId: requestId
        });
      }
    }
  } catch {}
}

// 社区帖子评论通知
async function notifyCommunityPostComment(store, postId, userId, parentId) {
  try {
    const commenter = await store.findUserById(userId);
    const name = commenter?.displayName ?? commenter?.username ?? String(userId);
    const post = typeof store.findCommunityPostById === "function"
      ? await store.findCommunityPostById(postId) : null;
    const authorId = post?.authorId;

    if (authorId && authorId !== userId) {
      const msg = parentId ? "回复了你的帖子下的评论" : "评论了你的帖子";
      await safeNotify(store, {
        userId: authorId, actorId: userId, type: "social",
        title: "新的评论", content: name + " " + msg + "「" + (post?.title ?? "") + "」",
        businessType: "community_post", businessId: postId
      });
    }
    if (parentId && typeof store.listCommunityPostComments === "function") {
      const comments = await store.listCommunityPostComments(postId);
      const parent = comments.find(function(c) { return c.commentId === Number(parentId); });
      if (parent && parent.userId !== userId && parent.userId !== authorId) {
        await safeNotify(store, {
          userId: parent.userId, actorId: userId, type: "social",
          title: "评论被回复", content: name + " 回复了你的评论",
          businessType: "community_post", businessId: postId
        });
      }
    }
  } catch {}
}

// 帖子点赞通知
async function notifyCommunityPostLike(store, post, userId) {
  try {
    const authorId = post?.authorId ?? post?.userId;
    if (!authorId || authorId === userId) return;
    const liker = await store.findUserById(userId);
    const name = liker?.displayName ?? liker?.username ?? String(userId);
    await safeNotify(store, {
      userId: authorId, actorId: userId, type: "social",
      title: "帖子被点赞", content: name + " 赞了你的帖子「" + (post?.title ?? "") + "」",
      businessType: "community_post", businessId: post?.postId
    });
  } catch {}
}

// 帖子评论点赞通知

async function notifyCommunityCommentLike(store, comment, likerId) {
  try {
    const authorId = comment?.userId;
    if (!authorId || authorId === likerId) return;
    const liker = await store.findUserById(likerId);
    const name = liker?.displayName ?? liker?.username ?? "用户";
    await safeNotify(store, {
      userId: authorId, actorId: likerId, type: "social",
      title: "评论被点赞", content: name + " 赞了你的评论",
      businessType: "community_post_comment", businessId: comment?.commentId
    });
  } catch {}
}

async function notifyRequestCommentLike(store, comment, likerId) {
  try {
    const authorId = comment?.userId;
    if (!authorId || authorId === likerId) return;
    const liker = await store.findUserById(likerId);
    const name = liker?.displayName ?? liker?.username ?? "用户";
    await safeNotify(store, {
      userId: authorId, actorId: likerId, type: "social",
      title: "评论被点赞", content: name + " 赞了你的评论",
      businessType: "request_comment", businessId: comment?.commentId
    });
  } catch {}
}
