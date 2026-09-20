const string Origin = "https://app.local/";
var cases = new[]
{
    (new Uri("https://app.local/"), true),
    (new Uri("https://app.local/assets/game.js"), true),
    (new Uri("https://app.local.evil.example/"), false),
    (new Uri("https://example.com/"), false),
    (new Uri("file:///C:/Windows/System32/drivers/etc/hosts"), false),
};

foreach (var (uri, expected) in cases)
{
    if (NavigationPolicy.IsAllowed(uri, Origin) != expected)
        throw new InvalidOperationException($"Unexpected navigation result for {uri}");
}

Console.WriteLine("Launcher navigation checks passed.");
