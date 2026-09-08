using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;

namespace RoguelikeCardFramework.Core
{
    // Small JSON reader for the existing content-pack files. It has no browser or Node dependency.
    public static class MiniJson
    {
        public static object Deserialize(string json) => string.IsNullOrEmpty(json) ? null : new Parser(json).ParseValue();

        private sealed class Parser
        {
            private readonly StringReader reader;
            public Parser(string json) { reader = new StringReader(json); }
            public object ParseValue()
            {
                EatWhitespace();
                var c = Peek;
                if (c == '{') return ParseObject();
                if (c == '[') return ParseArray();
                if (c == '"') return ParseString();
                if (c == '-' || char.IsDigit(c)) return ParseNumber();
                var word = ParseWord();
                if (word == "true") return true;
                if (word == "false") return false;
                return null;
            }
            private Dictionary<string, object> ParseObject()
            {
                var result = new Dictionary<string, object>(); reader.Read();
                while (true)
                {
                    EatWhitespace(); if (Peek == '}') { reader.Read(); return result; }
                    var key = ParseString(); EatWhitespace(); reader.Read();
                    result[key] = ParseValue(); EatWhitespace();
                    var separator = reader.Read(); if (separator == '}') return result;
                }
            }
            private List<object> ParseArray()
            {
                var result = new List<object>(); reader.Read();
                while (true)
                {
                    EatWhitespace(); if (Peek == ']') { reader.Read(); return result; }
                    result.Add(ParseValue()); EatWhitespace();
                    var separator = reader.Read(); if (separator == ']') return result;
                }
            }
            private string ParseString()
            {
                var value = new StringBuilder(); reader.Read();
                while (true)
                {
                    var next = reader.Read(); if (next < 0) return value.ToString();
                    var c = (char)next; if (c == '"') return value.ToString();
                    if (c != '\\') { value.Append(c); continue; }
                    c = (char)reader.Read();
                    if (c == 'u')
                    {
                        var hex = new char[4]; for (var i = 0; i < 4; i++) hex[i] = (char)reader.Read();
                        value.Append((char)Convert.ToInt32(new string(hex), 16));
                    }
                    else value.Append(c == 'n' ? '\n' : c == 'r' ? '\r' : c == 't' ? '\t' : c == 'b' ? '\b' : c == 'f' ? '\f' : c);
                }
            }
            private object ParseNumber()
            {
                var raw = ParseWhile(c => "-+0123456789.eE".IndexOf(c) >= 0);
                return raw.IndexOf('.') >= 0 || raw.IndexOf('e') >= 0 || raw.IndexOf('E') >= 0
                    ? (object)double.Parse(raw, CultureInfo.InvariantCulture)
                    : long.Parse(raw, CultureInfo.InvariantCulture);
            }
            private string ParseWord() => ParseWhile(c => char.IsLetter(c));
            private string ParseWhile(Func<char, bool> predicate)
            {
                var value = new StringBuilder(); while (reader.Peek() >= 0 && predicate(Peek)) value.Append((char)reader.Read()); return value.ToString();
            }
            private void EatWhitespace() { while (reader.Peek() >= 0 && char.IsWhiteSpace(Peek)) reader.Read(); }
            private char Peek => (char)reader.Peek();
        }

        public static Dictionary<string, object> Obj(object value) => value as Dictionary<string, object>;
        public static List<object> Arr(object value) => value as List<object>;
        public static string Str(Dictionary<string, object> obj, string key, string fallback = "") => obj != null && obj.TryGetValue(key, out var v) ? Convert.ToString(v, CultureInfo.InvariantCulture) : fallback;
        public static int Int(Dictionary<string, object> obj, string key, int fallback = 0) => obj != null && obj.TryGetValue(key, out var v) ? Convert.ToInt32(v, CultureInfo.InvariantCulture) : fallback;
    }
}
