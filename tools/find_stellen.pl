#!/usr/bin/perl
# Sucht Sätze mit Stellenangabe (Buch,Kapitel,Paragraph) in Latin-Library-Dateien.
# perl find.pl PRAEFIX MAXLEN REGEX datei1 datei2 ...   (Dateiname ...N.html → Buch N)
use strict; use warnings; binmode STDOUT, ':utf8';
my ($pre, $max, $re, @files) = @ARGV;
for my $f (@files) {
  my ($book) = $f =~ /(\d+)\.html$/; $book //= '';
  open my $fh, '<:encoding(latin1)', $f or next; local $/; my $t = <$fh>;
  $t =~ s/<[^>]+>/ /g; $t =~ s/&nbsp;/ /g; $t =~ s/\s+/ /g;
  my @ch = split /\[\s*(\d+)\s*\]/, $t;
  for (my $i = 1; $i < @ch; $i += 2) {
    my ($c, $txt) = ($ch[$i], $ch[$i + 1]);
    # Paragraphen: Zahl vor Großbuchstaben
    my @par = split /\s(\d{1,2})\s(?=[A-Za-z])/, " 0 $txt";
    @par = ('', 0, $txt) if @par < 3;     # Texte ohne Paragraphennummern (z. B. Cicero: nur §)
    for (my $j = 1; $j < @par; $j += 2) {
      my ($p, $pt) = ($par[$j], $par[$j + 1]);
      # in Sätze zerlegen (nach . ; : ? !), dann jeden Satz prüfen
      for my $s (split /(?<=[.;:?!])\s+/, $pt) {
        $s =~ s/^\s+|\s+$//g;
        next unless $s =~ /$re/ && length($s) <= $max;
        print "$pre $book,$c,$p: $s\n";
      }
    }
  }
}
