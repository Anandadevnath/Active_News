import { cli } from '@jackwener/opencli/registry';
cli({
    site: 'instagram',
    name: 'user',
    access: 'read',
    description: 'Get recent posts from an Instagram user',
    domain: 'www.instagram.com',
    args: [
        { name: 'username', required: true, positional: true, help: 'Instagram username' },
        { name: 'limit', type: 'int', default: 12, help: 'Number of posts' },
    ],
    columns: ['index', 'url', 'caption', 'cover', 'video', 'likes', 'comments', 'views', 'type', 'taken'],
    pipeline: [
        { navigate: 'https://www.instagram.com' },
        { evaluate: `(async () => {
  const username = \${{ args.username | json }};
  const limit = \${{ args.limit }};
  const headers = { 'X-IG-App-ID': '936619743392459' };
  const opts = { credentials: 'include', headers };

  // Fetch directly by username. web_profile_info is gated for some public
  // accounts even with a valid session, while this feed endpoint still returns
  // the same media item shape this command maps.
  const r2 = await fetch(
    'https://www.instagram.com/api/v1/feed/user/' + encodeURIComponent(username) + '/username/?count=' + limit,
    opts
  );
  if (!r2.ok) throw new Error('HTTP ' + r2.status + ' - make sure you are logged in to Instagram');
  const d2 = await r2.json();
  return (d2?.items || []).slice(0, limit).map((p, i) => ({
    index: i + 1,
    // Active News (this repo's server) consumes url/cover/video/views/taken:
    // the post permalink, the best still, the progressive mp4 when it is a video,
    // play/view count, and an ISO timestamp.
    url: p.code ? 'https://www.instagram.com/p/' + p.code + '/' : '',
    caption: (p.caption?.text || '').replace(/\\n/g, ' ').substring(0, 300),
    cover: (p.image_versions2?.candidates || []).find((c) => c?.url)?.url || p.display_url || '',
    video: (p.video_versions || []).find((v) => v?.url)?.url || '',
    likes: p.like_count ?? 0,
    comments: p.comment_count ?? 0,
    views: p.play_count ?? p.view_count ?? 0,
    type: p.media_type === 1 ? 'photo' : p.media_type === 2 ? 'video' : 'carousel',
    taken: p.taken_at ? new Date(p.taken_at * 1000).toISOString() : '',
    date: p.taken_at ? new Date(p.taken_at * 1000).toLocaleDateString() : '',
  }));
})()
` },
    ],
});
