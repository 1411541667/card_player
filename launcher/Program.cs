using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Windows.Forms;
using System.Threading.Tasks;
using System;
using System.IO;

ApplicationConfiguration.Initialize();
var index = Path.Combine(AppContext.BaseDirectory, "dist", "index.html");
if (!File.Exists(index)) { MessageBox.Show("游戏文件不完整：未找到 dist\\index.html。", "异变独行", MessageBoxButtons.OK, MessageBoxIcon.Error); return; }
try { Application.Run(new GameForm(index)); }
catch (WebView2RuntimeNotFoundException) { MessageBox.Show("未找到 Microsoft Edge WebView2 Runtime，请安装后重试。", "异变独行", MessageBoxButtons.OK, MessageBoxIcon.Error); }
catch (Exception e) { MessageBox.Show($"游戏启动失败：{e.Message}", "异变独行", MessageBoxButtons.OK, MessageBoxIcon.Error); }

sealed class GameForm : Form
{
    private readonly WebView2 view = new();
    private readonly string index;
    public GameForm(string index)
    {
        this.index = index; Text = "异变独行"; StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new System.Drawing.Size(960, 640); ClientSize = new System.Drawing.Size(1280, 800);
        view.Dock = DockStyle.Fill; Controls.Add(view); Shown += async (_, _) => await StartAsync();
    }
    private async Task StartAsync()
    {
        var data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RoguelikeCardFramework", "WebView2");
        var env = await CoreWebView2Environment.CreateAsync(null, data); await view.EnsureCoreWebView2Async(env);
        view.CoreWebView2.Settings.AreDevToolsEnabled = false; view.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false; view.CoreWebView2.Settings.IsStatusBarEnabled = false;
        view.CoreWebView2.NavigationStarting += (_, e) => { if (!e.Uri.StartsWith("file://", StringComparison.OrdinalIgnoreCase)) e.Cancel = true; };
        view.CoreWebView2.NewWindowRequested += (_, e) => e.Handled = true; view.Source = new Uri(index);
    }
}
