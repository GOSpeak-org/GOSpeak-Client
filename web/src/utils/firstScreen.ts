/**
 * 首屏目标域：优先回到上次所在域，但必须仍在我的域列表里
 * （可能已经退域、被移出，或换了账号导致本地记录过期）。
 *
 * @returns 目标域 UUID；没有任何已加入的域时返回 null，交给发现页引导创建/加入。
 */
export function resolveFirstScreen(
	myDomainUUIDs: readonly string[],
	lastDomainUUID: string | null,
): string | null {
	if (myDomainUUIDs.length === 0) return null;
	if (lastDomainUUID && myDomainUUIDs.includes(lastDomainUUID)) {
		return lastDomainUUID;
	}
	return myDomainUUIDs[0];
}

/**
 * 冷启动分流：不等网络。
 *
 * 域列表还没拿到（冷启动首次请求仍在路上）时，直接用上次所在的域分流，
 * 让首屏立刻可操作；列表回来后路由层再按 resolveFirstScreen 校验并纠正。
 * 已经有列表缓存时仍然严格按列表校验（退域 / 被移出 / 换号都能识别）。
 */
export function resolveFirstScreenFromCache(
	myDomainUUIDs: readonly string[],
	lastDomainUUID: string | null,
): string | null {
	if (myDomainUUIDs.length > 0) {
		return resolveFirstScreen(myDomainUUIDs, lastDomainUUID);
	}
	return lastDomainUUID;
}
